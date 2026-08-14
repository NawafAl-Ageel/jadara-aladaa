import { esc } from './dom.js';
import { getSupabase } from './supabase-client.js';
import { logAudit } from './audit.js';

const BUCKET = 'documents';
const MAX_SIZE_BYTES = 20 * 1024 * 1024; // 20MB
const ALLOWED_MIME = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/png', 'image/jpeg', 'image/webp',
  'text/csv', 'text/plain'
]);

function sanitizeFileName(name) {
  return name.replace(/[^\w.\-]+/g, '_').slice(-140);
}

export async function listAttachments(ownerType, ownerId) {
  const sb = getSupabase();
  const { data, error } = await sb
    .from('attachments')
    .select('*, profiles:uploaded_by(full_name, email)')
    .eq('owner_type', ownerType)
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function uploadAttachment(ownerType, ownerId, file) {
  if (file.size > MAX_SIZE_BYTES) {
    throw new Error('حجم الملف يتجاوز الحد المسموح (20 ميجابايت)');
  }
  if (file.type && !ALLOWED_MIME.has(file.type)) {
    throw new Error('نوع الملف غير مدعوم');
  }

  const sb = getSupabase();
  const { data: { user } } = await sb.auth.getUser();
  const path = `${ownerType}/${ownerId}/${Date.now()}-${sanitizeFileName(file.name)}`;

  const { error: uploadError } = await sb.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || 'application/octet-stream',
    upsert: false
  });
  if (uploadError) throw uploadError;

  const { data: row, error: insertError } = await sb.from('attachments').insert([{
    owner_type: ownerType,
    owner_id: ownerId,
    file_url: path,
    file_name: file.name,
    mime_type: file.type || null,
    size_bytes: file.size,
    uploaded_by: user?.id || null
  }]).select('*').single();
  if (insertError) {
    await sb.storage.from(BUCKET).remove([path]);
    throw insertError;
  }

  await logAudit('create', 'attachment', row.id, null, { owner_type: ownerType, owner_id: ownerId, file_name: file.name });
  return row;
}

export async function deleteAttachment(attachment) {
  const sb = getSupabase();
  await sb.storage.from(BUCKET).remove([attachment.file_url]);
  const { error } = await sb.from('attachments').delete().eq('id', attachment.id);
  if (error) throw error;
  await logAudit('delete', 'attachment', attachment.id);
}

async function downloadAttachment(attachment) {
  const sb = getSupabase();
  const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(attachment.file_url, 60);
  if (error) { alert('تعذر إنشاء رابط التحميل: ' + error.message); return; }
  window.open(data.signedUrl, '_blank', 'noopener');
}

function formatSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} كيلوبايت`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} ميجابايت`;
}

function renderList(attachments) {
  if (!attachments.length) return '<p class="qa-empty">لا توجد مرفقات بعد</p>';
  return attachments.map(a => `
    <div class="attachment-row" data-attachment-id="${a.id}">
      <div class="attachment-row__info">
        <span class="attachment-row__name">${esc(a.file_name)}</span>
        <span class="attachment-row__meta">${formatSize(a.size_bytes)} · ${esc(a.profiles?.full_name || a.profiles?.email || '')}</span>
      </div>
      <div class="attachment-row__actions">
        <button type="button" class="btn-back" data-download-attachment="${a.id}">تحميل</button>
        <button type="button" class="btn-delete" data-delete-attachment="${a.id}">حذف</button>
      </div>
    </div>
  `).join('');
}

// Renders + binds a full upload/list widget into `containerEl`. Reused by
// the Clients and Projects detail pages.
export async function mountAttachmentsWidget(containerEl, ownerType, ownerId) {
  containerEl.innerHTML = `
    <div class="attachment-upload">
      <input type="file" id="attachmentFileInput_${ownerType}_${ownerId}" hidden>
      <button type="button" class="btn-back" id="attachmentUploadBtn_${ownerType}_${ownerId}">+ رفع مستند</button>
    </div>
    <div class="attachment-list" id="attachmentList_${ownerType}_${ownerId}">جارٍ التحميل...</div>
  `;

  const fileInput = containerEl.querySelector(`#attachmentFileInput_${ownerType}_${ownerId}`);
  const uploadBtn = containerEl.querySelector(`#attachmentUploadBtn_${ownerType}_${ownerId}`);
  const listEl = containerEl.querySelector(`#attachmentList_${ownerType}_${ownerId}`);

  async function refresh() {
    try {
      const attachments = await listAttachments(ownerType, ownerId);
      listEl.innerHTML = renderList(attachments);
      listEl.querySelectorAll('[data-download-attachment]').forEach(btn => {
        btn.addEventListener('click', () => {
          const a = attachments.find(x => String(x.id) === btn.dataset.downloadAttachment);
          if (a) downloadAttachment(a);
        });
      });
      listEl.querySelectorAll('[data-delete-attachment]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const a = attachments.find(x => String(x.id) === btn.dataset.deleteAttachment);
          if (!a || !confirm(`حذف الملف «${a.file_name}»؟`)) return;
          try {
            await deleteAttachment(a);
            refresh();
          } catch (err) {
            alert('تعذر حذف الملف: ' + (err?.message || String(err)));
          }
        });
      });
    } catch {
      listEl.innerHTML = '<p class="qa-empty">تعذر تحميل المرفقات</p>';
    }
  }

  uploadBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;
    uploadBtn.disabled = true;
    uploadBtn.textContent = 'جارٍ الرفع...';
    try {
      await uploadAttachment(ownerType, ownerId, file);
      await refresh();
    } catch (err) {
      alert('تعذر رفع الملف: ' + (err?.message || String(err)));
    }
    uploadBtn.disabled = false;
    uploadBtn.textContent = '+ رفع مستند';
    fileInput.value = '';
  });

  await refresh();
}
