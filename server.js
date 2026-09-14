require('dotenv').config();

const path = require('path');
const express = require('express');

const { connectDB, ordersCollection, settingsCollection } = require('./db');
const { sendOrderEmail, sendCustomerReceiptEmail } = require('./email');

const RATE_PER_PLATE = 500;
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || 'change-me';
const SETTINGS_ID = 'main'; // we only ever keep one settings document

// The four days a customer can book bhog for, and a short code used inside
// that day's unique order ID (e.g. UTSAV26-SAS-XXXXX for Shoshti).
const DAY_CODES = {
  Shoshti: 'SAS',
  Saptami: 'SAP',
  Ashtami: 'ASH',
  Navami: 'NAV'
};
const VALID_DAYS = Object.keys(DAY_CODES);
const VALID_LUNCH_TYPES = ['Packing', 'Community Lunch (Dine-In)'];

// ---------- app ----------
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function genId(middle) {
  const year = new Date().getFullYear().toString().slice(-2);
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  const time = Date.now().toString().slice(-4);
  return `UTSAV${year}-${middle}-${rand}${time}`;
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

// Create a new booking, made up of one order per selected day.
app.post('/api/orders', async (req, res) => {
  const { name, phone, email, lunchType, days } = req.body || {};

  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Name is required.' });
  }
  if (!/^[6-9]\d{9}$/.test(String(phone || '').trim())) {
    return res.status(400).json({ error: 'Enter a valid 10-digit Indian mobile number.' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim())) {
    return res.status(400).json({ error: 'Enter a valid email address.' });
  }
  if (!VALID_LUNCH_TYPES.includes(lunchType)) {
    return res.status(400).json({ error: 'Please choose a lunch type.' });
  }
  if (!Array.isArray(days) || days.length === 0) {
    return res.status(400).json({ error: 'Please select at least one day.' });
  }

  const seenDays = new Set();
  const cleanDays = [];
  for (const entry of days) {
    const day = entry && entry.day;
    const qtyNum = parseInt(entry && entry.qty, 10);
    if (!VALID_DAYS.includes(day)) {
      return res.status(400).json({ error: `"${day}" is not a valid day.` });
    }
    if (seenDays.has(day)) {
      return res.status(400).json({ error: `"${day}" was selected more than once.` });
    }
    if (!Number.isInteger(qtyNum) || qtyNum < 1 || qtyNum > 200) {
      return res.status(400).json({ error: `Enter a valid number of plates for ${day} (1-200).` });
    }
    seenDays.add(day);
    cleanDays.push({ day, qty: qtyNum });
  }

  const bookingId = genId('BK');
  const createdAt = new Date().toISOString();
  const cleanName = name.trim();
  const cleanPhone = String(phone).trim();
  const cleanEmail = String(email).trim();

  const dayOrders = cleanDays.map(({ day, qty }) => ({
    orderId: genId(DAY_CODES[day]),
    bookingId,
    day,
    lunchType,
    name: cleanName,
    phone: cleanPhone,
    email: cleanEmail,
    qty,
    amount: qty * RATE_PER_PLATE,
    status: 'pending', // pending | paid
    createdAt
  }));

  const totalAmount = dayOrders.reduce((sum, o) => sum + o.amount, 0);

  try {
    await ordersCollection().insertMany(dayOrders);
  } catch (e) {
    console.error('Failed to save booking:', e.message);
    return res.status(500).json({ error: 'Could not save your order right now. Please try again.' });
  }

  const settings = await getSettings();
  const booking = {
    bookingId,
    name: cleanName,
    phone: cleanPhone,
    email: cleanEmail,
    lunchType,
    totalAmount,
    dayOrders,
    createdAt
  };

  const upiLink = settings.upiId
    ? `upi://pay?pa=${encodeURIComponent(settings.upiId)}&pn=${encodeURIComponent(settings.payeeName)}&am=${totalAmount}&cu=INR&tn=${encodeURIComponent('Bhog booking ' + bookingId)}`
    : null;

  // Best-effort email notifications. Never blocks the order response.
  sendOrderEmail(booking).catch(err => console.error('Seller email failed:', err.message));
  sendCustomerReceiptEmail(booking, upiLink).catch(err => console.error('Customer email failed:', err.message));

  res.status(201).json({
    bookingId,
    totalAmount,
    lunchType,
    orders: dayOrders.map(o => ({ orderId: o.orderId, day: o.day, qty: o.qty, amount: o.amount })),
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
  const totalBookings = new Set(orders.map(o => o.bookingId)).size;
  const totalPlates = orders.reduce((sum, o) => sum + o.qty, 0);
  const totalAmount = orders.reduce((sum, o) => sum + o.amount, 0);
  const paidAmount = orders.filter(o => o.status === 'paid').reduce((sum, o) => sum + o.amount, 0);
  res.json({ totalOrders, totalBookings, totalPlates, totalAmount, paidAmount });
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
  const header = ['Order ID', 'Booking ID', 'Day', 'Lunch Type', 'Name', 'Phone', 'Email', 'Plates', 'Amount', 'Status', 'Created At'];
  const rows = orders.map(o => [
    o.orderId, o.bookingId, o.day, o.lunchType, o.name, o.phone, o.email, o.qty, o.amount, o.status, o.createdAt
  ]);
  const csv = [header, ...rows]
    .map(r => r.map(v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`).join(','))
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
