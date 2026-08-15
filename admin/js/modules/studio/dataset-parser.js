import { CANONICAL_FIELDS } from './constants.js';

/* CSV/Excel parsing via SheetJS (loaded from CDN in index.html, same
   pattern as Chart.js/Supabase — no bundler, no npm dependency). One code
   path handles both formats since SheetJS reads either. */

function normalize(str) {
  return String(str || '').toLowerCase().trim().replace(/[\s_-]+/g, '');
}

export function parseFile(file) {
  return new Promise((resolve, reject) => {
    if (typeof XLSX === 'undefined') {
      reject(new Error('مكتبة قراءة الملفات لم يتم تحميلها بعد — أعد تحميل الصفحة وحاول مجدداً'));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('تعذر قراءة الملف'));
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        // eslint-disable-next-line no-undef
        const workbook = XLSX.read(data, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        // eslint-disable-next-line no-undef
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: null, raw: false });
        // eslint-disable-next-line no-undef
        const headerRow = XLSX.utils.sheet_to_json(sheet, { header: 1 })[0] || [];
        const headers = headerRow.map(h => String(h ?? '').trim()).filter(Boolean);
        if (!headers.length || !rows.length) {
          reject(new Error('الملف فارغ أو لا يحتوي على صف عناوين واضح'));
          return;
        }
        resolve({ headers, rawRows: rows });
      } catch (err) {
        reject(new Error('تعذر تحليل الملف — تأكد أنه CSV أو Excel صالح'));
      }
    };
    reader.readAsArrayBuffer(file);
  });
}

// Best-effort auto-suggestion so the consultant doesn't map every column by
// hand — matched by normalized string comparison against the canonical
// key and Arabic label. Never auto-maps ambiguously; leaves it to "تجاهل"
// (ignore) when unsure.
export function suggestColumnMap(headers) {
  const map = {};
  for (const header of headers) {
    const n = normalize(header);
    const match = CANONICAL_FIELDS.find(f => normalize(f.key) === n || normalize(f.label) === n);
    map[header] = match ? match.key : null;
  }
  return map;
}

function coerceNumber(val) {
  if (val === null || val === undefined || val === '') return null;
  const n = Number(String(val).replace(/[,\s]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function coerceDate(val) {
  if (!val) return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

// Transforms raw file rows (keyed by the client's original column headers)
// into canonical-keyed rows the report engine understands, and flags rows
// where a numeric/date field couldn't be parsed rather than silently
// dropping them.
export function applyColumnMap(rawRows, columnMap) {
  const fieldTypeByKey = Object.fromEntries(CANONICAL_FIELDS.map(f => [f.key, f.type]));
  const warnings = [];

  const canonicalRows = rawRows.map((raw, rowIndex) => {
    const out = {};
    for (const [header, canonicalKey] of Object.entries(columnMap)) {
      if (!canonicalKey) continue;
      const rawVal = raw[header];
      const type = fieldTypeByKey[canonicalKey];
      if (type === 'number') {
        const n = coerceNumber(rawVal);
        if (rawVal !== null && rawVal !== '' && n === null) {
          warnings.push({ row: rowIndex + 2, field: canonicalKey, message: `قيمة غير رقمية: "${rawVal}"` });
        }
        out[canonicalKey] = n;
      } else if (type === 'date') {
        const d = coerceDate(rawVal);
        if (rawVal && !d) {
          warnings.push({ row: rowIndex + 2, field: canonicalKey, message: `تاريخ غير صالح: "${rawVal}"` });
        }
        out[canonicalKey] = d;
      } else {
        out[canonicalKey] = rawVal === null ? null : String(rawVal).trim();
      }
    }
    return out;
  });

  return { canonicalRows, warnings };
}

export function distinctValues(canonicalRows, field) {
  const set = new Set();
  for (const row of canonicalRows) {
    if (row[field] !== null && row[field] !== undefined && row[field] !== '') set.add(row[field]);
  }
  return Array.from(set).sort();
}
