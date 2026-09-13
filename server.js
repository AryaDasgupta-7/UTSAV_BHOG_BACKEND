require('dotenv').config();

const path = require('path');
const express = require('express');
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');

const { sendOrderEmail } = require('./email');

const RATE_PER_PLATE = 800;
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || 'change-me';

// ---------- storage ----------
const adapter = new FileSync(path.join(__dirname, 'db.json'));
const db = low(adapter);
db.defaults({
  orders: [],
  settings: { upiId: '', payeeName: 'Durga Puja Committee' }
}).write();

// ---------- app ----------
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function genOrderId() {
  const year = new Date().getFullYear().toString().slice(-2);
  const rand = Math.random().toString(36).slice(2, 7).toUpperCase();
  const time = Date.now().toString().slice(-4);
  return `DGP${year}-${rand}${time}`;
}

function requireAdmin(req, res, next) {
  const key = req.header('x-api-key');
  if (!key || key !== ADMIN_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized. Check your admin API key.' });
  }
  next();
}

// ---------- public endpoints ----------

// Create a new order
app.post('/api/orders', async (req, res) => {
  const { name, phone, email, qty } = req.body || {};

  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Name is required.' });
  }
  if (!/^[6-9]\d{9}$/.test(String(phone || '').trim())) {
    return res.status(400).json({ error: 'Enter a valid 10-digit Indian mobile number.' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim())) {
    return res.status(400).json({ error: 'Enter a valid email address.' });
  }
  const qtyNum = parseInt(qty, 10);
  if (!Number.isInteger(qtyNum) || qtyNum < 1 || qtyNum > 200) {
    return res.status(400).json({ error: 'Enter a valid number of plates (1-200).' });
  }

  const orderId = genOrderId();
  const amount = qtyNum * RATE_PER_PLATE;

  const order = {
    orderId,
    name: name.trim(),
    phone: String(phone).trim(),
    email: String(email).trim(),
    qty: qtyNum,
    amount,
    status: 'pending', // pending | paid
    createdAt: new Date().toISOString()
  };

  db.get('orders').push(order).write();

  // Best-effort email notification to the seller. Never blocks the order.
  sendOrderEmail(order).catch(() => {});

  const settings = db.get('settings').value();
  res.status(201).json({
    orderId,
    amount,
    upiId: settings.upiId,
    payeeName: settings.payeeName
  });
});

// Public UPI settings, used by the storefront to build the payment link/QR
app.get('/api/settings', (req, res) => {
  res.json(db.get('settings').value());
});

// ---------- admin endpoints (require x-api-key header) ----------

app.get('/api/admin/orders', requireAdmin, (req, res) => {
  const orders = db.get('orders').value().slice().reverse();
  res.json({ orders });
});

app.get('/api/admin/stats', requireAdmin, (req, res) => {
  const orders = db.get('orders').value();
  const totalOrders = orders.length;
  const totalPlates = orders.reduce((sum, o) => sum + o.qty, 0);
  const totalAmount = orders.reduce((sum, o) => sum + o.amount, 0);
  const paidAmount = orders.filter(o => o.status === 'paid').reduce((sum, o) => sum + o.amount, 0);
  res.json({ totalOrders, totalPlates, totalAmount, paidAmount });
});

app.post('/api/admin/settings', requireAdmin, (req, res) => {
  const { upiId, payeeName } = req.body || {};
  db.set('settings.upiId', String(upiId || '').trim()).write();
  db.set('settings.payeeName', String(payeeName || 'Durga Puja Committee').trim()).write();
  res.json({ ok: true });
});

app.post('/api/admin/orders/:orderId/status', requireAdmin, (req, res) => {
  const { orderId } = req.params;
  const { status } = req.body || {};
  if (!['pending', 'paid'].includes(status)) {
    return res.status(400).json({ error: 'Status must be "pending" or "paid".' });
  }
  const existing = db.get('orders').find({ orderId }).value();
  if (!existing) return res.status(404).json({ error: 'Order not found.' });

  db.get('orders').find({ orderId }).assign({ status }).write();
  res.json({ ok: true });
});

app.get('/api/admin/orders/export', requireAdmin, (req, res) => {
  const orders = db.get('orders').value();
  const header = ['Order ID', 'Name', 'Phone', 'Email', 'Plates', 'Amount', 'Status', 'Created At'];
  const rows = orders.map(o => [o.orderId, o.name, o.phone, o.email, o.qty, o.amount, o.status, o.createdAt]);
  const csv = [header, ...rows]
    .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="bhog-orders.csv"');
  res.send(csv);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Bhog backend running on http://localhost:${PORT}`);
});
