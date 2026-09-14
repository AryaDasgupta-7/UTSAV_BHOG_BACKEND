require('dotenv').config();

const path = require('path');
const express = require('express');

const { connectDB, ordersCollection, settingsCollection } = require('./db');
const { sendOrderEmail, sendCustomerReceiptEmail } = require('./email');

const RATE_PER_PLATE = 500;
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || 'change-me';
const SETTINGS_ID = 'main'; // we only ever keep one settings document

// ---------- app ----------
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function genOrderId() {
  const year = new Date().getFullYear().toString().slice(-2);
  const rand = Math.random().toString(36).slice(2, 7).toUpperCase();
  const time = Date.now().toString().slice(-4);
  return `UTSAV${year}-${rand}${time}`;
}

function requireAdmin(req, res, next) {
  const key = req.header('x-api-key');
  if (!key || key !== ADMIN_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized. Check your admin API key.' });
  }
  next();
}

async function getSettings() {
  const existing = await settingsCollection().findOne({ _id: SETTINGS_ID });
  return existing || { _id: SETTINGS_ID, upiId: '', payeeName: 'Durga Puja Committee' };
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

  try {
    await ordersCollection().insertOne(order);
  } catch (e) {
    console.error('Failed to save order:', e.message);
    return res.status(500).json({ error: 'Could not save your order right now. Please try again.' });
  }

  // Best-effort email notifications. Never blocks the order response.
  const settings = await getSettings();
  const upiLink = settings.upiId
    ? `upi://pay?pa=${encodeURIComponent(settings.upiId)}&pn=${encodeURIComponent(settings.payeeName)}&am=${amount}&cu=INR&tn=${encodeURIComponent('Bhog order ' + orderId)}`
    : null;

  sendOrderEmail(order).catch(err => console.error('Seller email failed:', err.message));
  sendCustomerReceiptEmail(order, upiLink).catch(err => console.error('Customer email failed:', err.message));

  res.status(201).json({
    orderId,
    amount,
    upiId: settings.upiId,
    payeeName: settings.payeeName
  });
});

// Public UPI settings, used by the storefront to build the payment link/QR
app.get('/api/settings', async (req, res) => {
  const settings = await getSettings();
  res.json({ upiId: settings.upiId, payeeName: settings.payeeName });
});

// ---------- admin endpoints (require x-api-key header) ----------

app.get('/api/admin/orders', requireAdmin, async (req, res) => {
  const orders = await ordersCollection().find({}).sort({ createdAt: -1 }).toArray();
  res.json({ orders });
});

app.get('/api/admin/stats', requireAdmin, async (req, res) => {
  const orders = await ordersCollection().find({}).toArray();
  const totalOrders = orders.length;
  const totalPlates = orders.reduce((sum, o) => sum + o.qty, 0);
  const totalAmount = orders.reduce((sum, o) => sum + o.amount, 0);
  const paidAmount = orders.filter(o => o.status === 'paid').reduce((sum, o) => sum + o.amount, 0);
  res.json({ totalOrders, totalPlates, totalAmount, paidAmount });
});

app.post('/api/admin/settings', requireAdmin, async (req, res) => {
  const { upiId, payeeName } = req.body || {};
  await settingsCollection().updateOne(
    { _id: SETTINGS_ID },
    {
      $set: {
        upiId: String(upiId || '').trim(),
        payeeName: String(payeeName || 'Durga Puja Committee').trim()
      }
    },
    { upsert: true }
  );
  res.json({ ok: true });
});

app.post('/api/admin/orders/:orderId/status', requireAdmin, async (req, res) => {
  const { orderId } = req.params;
  const { status } = req.body || {};
  if (!['pending', 'paid'].includes(status)) {
    return res.status(400).json({ error: 'Status must be "pending" or "paid".' });
  }
  const result = await ordersCollection().updateOne({ orderId }, { $set: { status } });
  if (result.matchedCount === 0) {
    return res.status(404).json({ error: 'Order not found.' });
  }
  res.json({ ok: true });
});

app.get('/api/admin/orders/export', requireAdmin, async (req, res) => {
  const orders = await ordersCollection().find({}).sort({ createdAt: -1 }).toArray();
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

// Connect to MongoDB Atlas first, then start accepting requests.
connectDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Bhog backend running on http://localhost:${PORT}`);
    });
  })
  .catch(err => {
    console.error('Could not connect to MongoDB Atlas. Server not started.');
    console.error(err.message);
    process.exit(1);
  });
