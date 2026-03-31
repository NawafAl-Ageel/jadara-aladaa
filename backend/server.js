require('dotenv').config();
const express = require('express');
const session = require('express-session');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const { getDb, initDb } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);

app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(',').map(s => s.trim());
app.use(cors({
  origin(origin, cb) {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error('Not allowed by CORS'));
  },
  credentials: true
}));

app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  name: 'jadara.sid',
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 8 * 60 * 60 * 1000
  }
}));

/* ---------- Rate Limiters ---------- */

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'محاولات كثيرة. حاول مجدداً بعد 15 دقيقة.' },
  standardHeaders: true,
  legacyHeaders: false
});

const leadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { error: 'تم تجاوز الحد المسموح. حاول مجدداً لاحقاً.' },
  standardHeaders: true,
  legacyHeaders: false
});

/* ---------- Helpers ---------- */

function requireAdmin(req, res, next) {
  if (!req.session.adminId) return res.status(401).json({ error: 'غير مصرح' });
  next();
}

function audit(userId, action, details, ip) {
  getDb().prepare('INSERT INTO audit_log (user_id, action, details, ip) VALUES (?, ?, ?, ?)').run(userId, action, details || null, ip || null);
}

/* ============================================================
   AUTH
   ============================================================ */

app.post('/api/admin/login', loginLimiter, (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'اسم المستخدم وكلمة المرور مطلوبان' });

  const user = getDb().prepare('SELECT * FROM admin_users WHERE username = ?').get(username);

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    audit(null, 'login_failed', `username: ${username}`, req.ip);
    return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
  }

  req.session.adminId = user.id;
  req.session.adminUsername = user.username;
  audit(user.id, 'login', null, req.ip);
  res.json({ success: true, username: user.username });
});

app.post('/api/admin/logout', requireAdmin, (req, res) => {
  audit(req.session.adminId, 'logout', null, req.ip);
  req.session.destroy(() => {
    res.clearCookie('jadara.sid');
    res.json({ success: true });
  });
});

app.get('/api/admin/me', (req, res) => {
  if (!req.session.adminId) return res.status(401).json({ error: 'غير مصرح' });
  res.json({ username: req.session.adminUsername });
});

/* ============================================================
   PUBLIC — Lead Submission
   ============================================================ */

app.post('/api/leads', leadLimiter, (req, res) => {
  const { name, email, phone, message, company, questionnaire } = req.body;

  if (!name || !email || !phone || !message) {
    return res.status(400).json({ error: 'جميع الحقول المطلوبة يجب ملؤها' });
  }
  if (typeof name !== 'string' || name.trim().length < 2) {
    return res.status(400).json({ error: 'الاسم غير صالح' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'البريد الإلكتروني غير صالح' });
  }
  if (typeof message !== 'string' || message.trim().length < 20) {
    return res.status(400).json({ error: 'الرسالة يجب أن تكون 20 حرفاً على الأقل' });
  }

  const result = getDb().prepare(
    'INSERT INTO leads (name, company, email, phone, message, questionnaire) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(
    name.trim(),
    company ? company.trim() : null,
    email.trim().toLowerCase(),
    phone.trim(),
    message.trim(),
    questionnaire ? JSON.stringify(questionnaire) : null
  );

  res.status(201).json({ success: true, id: Number(result.lastInsertRowid) });
});

/* ============================================================
   ADMIN — Leads CRUD
   ============================================================ */

app.get('/api/admin/stats', requireAdmin, (req, res) => {
  const db = getDb();
  const total = db.prepare('SELECT COUNT(*) as c FROM leads').get().c;
  const rows = db.prepare('SELECT status, COUNT(*) as c FROM leads GROUP BY status').all();

  const today = new Date().toISOString().split('T')[0];
  const todayCount = db.prepare("SELECT COUNT(*) as c FROM leads WHERE date(created_at) = ?").get(today).c;

  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
  const weekCount = db.prepare("SELECT COUNT(*) as c FROM leads WHERE date(created_at) >= ?").get(weekAgo).c;

  const s = {};
  for (const r of rows) s[r.status] = r.c;

  res.json({ total, today: todayCount, week: weekCount, new: s.new || 0, in_review: s.in_review || 0, contacted: s.contacted || 0, closed: s.closed || 0 });
});

app.get('/api/admin/leads', requireAdmin, (req, res) => {
  const db = getDb();
  const { status, search, page = 1, limit = 50 } = req.query;

  let where = '1=1';
  const params = [];

  if (status) { where += ' AND status = ?'; params.push(status); }
  if (search) {
    where += ' AND (name LIKE ? OR company LIKE ? OR email LIKE ? OR phone LIKE ?)';
    const s = `%${search}%`;
    params.push(s, s, s, s);
  }

  const total = db.prepare(`SELECT COUNT(*) as c FROM leads WHERE ${where}`).get(...params).c;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  const leads = db.prepare(`SELECT * FROM leads WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...params, parseInt(limit), offset);

  res.json({
    leads: leads.map(l => ({ ...l, questionnaire: l.questionnaire ? JSON.parse(l.questionnaire) : null })),
    total,
    page: parseInt(page),
    totalPages: Math.ceil(total / parseInt(limit))
  });
});

app.get('/api/admin/leads/export', requireAdmin, (req, res) => {
  const db = getDb();
  const { status } = req.query;
  let query = 'SELECT * FROM leads';
  const params = [];
  if (status) { query += ' WHERE status = ?'; params.push(status); }
  query += ' ORDER BY created_at DESC';

  const leads = db.prepare(query).all(...params);

  let csv = '\uFEFF'; // BOM for Excel Arabic support
  csv += 'ID,الاسم,الشركة,البريد الإلكتروني,الهاتف,الرسالة,الحالة,ملاحظات,تاريخ الإنشاء\n';
  for (const l of leads) {
    const esc = v => `"${(v || '').replace(/"/g, '""')}"`;
    csv += [l.id, esc(l.name), esc(l.company), esc(l.email), esc(l.phone), esc(l.message), l.status, esc(l.notes), l.created_at].join(',') + '\n';
  }

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename=jadara-leads.csv');
  res.send(csv);
});

app.get('/api/admin/leads/:id', requireAdmin, (req, res) => {
  const lead = getDb().prepare('SELECT * FROM leads WHERE id = ?').get(req.params.id);
  if (!lead) return res.status(404).json({ error: 'الطلب غير موجود' });
  lead.questionnaire = lead.questionnaire ? JSON.parse(lead.questionnaire) : null;
  res.json(lead);
});

app.patch('/api/admin/leads/:id', requireAdmin, (req, res) => {
  const db = getDb();
  const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(req.params.id);
  if (!lead) return res.status(404).json({ error: 'الطلب غير موجود' });

  const { status, notes } = req.body;
  const validStatuses = ['new', 'in_review', 'contacted', 'closed'];
  if (status && !validStatuses.includes(status)) return res.status(400).json({ error: 'حالة غير صالحة' });

  const sets = [];
  const params = [];
  if (status) { sets.push('status = ?'); params.push(status); }
  if (notes !== undefined) { sets.push('notes = ?'); params.push(notes); }
  sets.push('updated_at = CURRENT_TIMESTAMP');
  params.push(req.params.id);

  db.prepare(`UPDATE leads SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  audit(req.session.adminId, 'lead_updated', `Lead #${req.params.id}`, req.ip);

  const updated = db.prepare('SELECT * FROM leads WHERE id = ?').get(req.params.id);
  updated.questionnaire = updated.questionnaire ? JSON.parse(updated.questionnaire) : null;
  res.json(updated);
});

app.delete('/api/admin/leads/:id', requireAdmin, (req, res) => {
  const db = getDb();
  const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(req.params.id);
  if (!lead) return res.status(404).json({ error: 'الطلب غير موجود' });

  db.prepare('DELETE FROM leads WHERE id = ?').run(req.params.id);
  audit(req.session.adminId, 'lead_deleted', `Lead #${req.params.id}: ${lead.name}`, req.ip);
  res.json({ success: true });
});

/* ============================================================
   STATIC FILES
   ============================================================ */

app.use('/admin', express.static(path.join(__dirname, '..', 'admin')));
app.use(express.static(path.join(__dirname, '..')));

app.get('/admin/{*path}', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'admin', 'index.html'));
});

/* ============================================================
   START
   ============================================================ */

initDb();
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Admin panel: http://localhost:${PORT}/admin`);
});
