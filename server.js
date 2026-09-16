require('dotenv').config();

const path = require('path');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const Razorpay = require('razorpay');

const { connectDB, ordersCollection, settingsCollection } = require('./db');
const { sendOrderEmail, sendCustomerReceiptEmail } = require('./email');
const { uploadScreenshot } = require('./screenshot');

const RATE_PER_PLATE = 500;
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || 'change-me';
const SETTINGS_ID = 'main';

const DAY_CODES = {
  Shoshti: 'SAS',
  'Saptami (Adhik Puja)': 'SAA',
  Saptami: 'SAP',
  Ashtami: 'ASH',
  Navami: 'NAV'
};
const VALID_DAYS = Object.keys(DAY_CODES);
const VALID_LUNCH_TYPES = ['Packing', 'Community Lunch (Dine-In)'];

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

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
    status: 'pending',
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

// ---------- Razorpay ----------

app.post('/api/payments/create-order', async (req, res) => {
  const { bookingId } = req.body || {};

  if (!bookingId) {
    return res.status(400).json({ error: 'Booking ID is required.' });
  }

  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    return res.status(500).json({ error: 'Razorpay is not configured on the server.' });
  }

  try {
    const orders = await ordersCollection().find({ bookingId }).toArray();

    if (!orders.length) {
      return res.status(404).json({ error: 'Booking not found.' });
    }

    const totalAmount = orders.reduce((sum, order) => sum + Number(order.amount || 0), 0);

    if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
      return res.status(400).json({ error: 'Invalid booking amount.' });
    }

    if (orders.every(order => order.status === 'paid')) {
      return res.status(400).json({ error: 'This booking has already been paid.' });
    }

    // Reuse an existing Razorpay order for this booking when possible.
    const existingOrderId = orders.find(o => o.razorpayOrderId)?.razorpayOrderId;
    let razorpayOrder;

    if (existingOrderId) {
      try {
        razorpayOrder = await razorpay.orders.fetch(existingOrderId);
      } catch (_) {
        razorpayOrder = null;
      }
    }

    if (!razorpayOrder) {
      razorpayOrder = await razorpay.orders.create({
        amount: Math.round(totalAmount * 100),
        currency: 'INR',
        receipt: bookingId,
        notes: { bookingId }
      });
    }

    await ordersCollection().updateMany(
      { bookingId },
      {
        $set: {
          razorpayOrderId: razorpayOrder.id,
          razorpayOrderCreatedAt: new Date().toISOString()
        }
      }
    );

    res.json({
      keyId: process.env.RAZORPAY_KEY_ID,
      orderId: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      bookingId
    });
  } catch (error) {
    console.error('Razorpay order creation failed:', error);
    res.status(500).json({ error: 'Could not create the Razorpay payment order.' });
  }
});

app.post('/api/payments/verify', async (req, res) => {
  const {
    bookingId,
    razorpay_payment_id,
    razorpay_order_id,
    razorpay_signature
  } = req.body || {};

  if (!bookingId || !razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
    return res.status(400).json({ error: 'Missing payment verification details.' });
  }

  try {
    const bookingOrders = await ordersCollection().find({ bookingId }).toArray();

    if (!bookingOrders.length) {
      return res.status(404).json({ error: 'Booking not found.' });
    }

    const storedOrderId = bookingOrders[0].razorpayOrderId;

    if (!storedOrderId) {
      return res.status(400).json({ error: 'No Razorpay order is associated with this booking.' });
    }

    if (storedOrderId !== razorpay_order_id) {
      return res.status(400).json({ error: 'Razorpay order ID mismatch.' });
    }

    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${storedOrderId}|${razorpay_payment_id}`)
      .digest('hex');

    const expectedBuffer = Buffer.from(expectedSignature, 'hex');
    const receivedBuffer = Buffer.from(String(razorpay_signature), 'hex');

    if (
      expectedBuffer.length !== receivedBuffer.length ||
      !crypto.timingSafeEqual(expectedBuffer, receivedBuffer)
    ) {
      console.error('Invalid Razorpay signature for booking:', bookingId);
      return res.status(400).json({ error: 'Payment verification failed.' });
    }

    await ordersCollection().updateMany(
      { bookingId },
      {
        $set: {
          status: 'paid',
          razorpayPaymentId: razorpay_payment_id,
          razorpayOrderId: razorpay_order_id,
          razorpaySignatureVerified: true,
          paidAt: new Date().toISOString()
        }
      }
    );

    res.json({ ok: true, paid: true, bookingId });
  } catch (error) {
    console.error('Razorpay verification failed:', error);
    res.status(500).json({ error: 'Could not verify payment.' });
  }
});

app.get('/api/settings', async (req, res) => {
  const settings = await getSettings();
  res.json({ upiId: settings.upiId, payeeName: settings.payeeName });
});

app.post('/api/orders/:bookingId/utr', async (req, res) => {
  const { bookingId } = req.params;
  const utr = String((req.body || {}).utr || '').trim();

  if (!/^[A-Za-z0-9]{6,30}$/.test(utr)) {
    return res.status(400).json({ error: 'Enter a valid UPI reference number (usually 12 digits, shown in your payment app).' });
  }

  const result = await ordersCollection().updateMany(
    { bookingId },
    { $set: { utr, utrSubmittedAt: new Date().toISOString() } }
  );

  if (result.matchedCount === 0) {
    return res.status(404).json({ error: 'Booking not found.' });
  }

  res.json({ ok: true });
});

const screenshotUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }
});

function handleScreenshotUpload(req, res, next) {
  screenshotUpload.single('screenshot')(req, res, (err) => {
    if (err) {
      const message = err.code === 'LIMIT_FILE_SIZE'
        ? 'That image is too large. Please upload a screenshot under 5MB.'
        : 'Could not process the uploaded file. Please try a different image.';
      return res.status(400).json({ error: message });
    }
    next();
  });
}

app.post('/api/orders/:bookingId/screenshot', handleScreenshotUpload, async (req, res) => {
  const { bookingId } = req.params;

  if (!req.file) {
    return res.status(400).json({ error: 'Please attach a screenshot image.' });
  }
  if (!req.file.mimetype.startsWith('image/')) {
    return res.status(400).json({ error: 'Only image files are allowed.' });
  }

  let url;
  try {
    url = await uploadScreenshot(req.file.buffer, bookingId);
  } catch (e) {
    console.error('Screenshot upload failed:', e.message);
    return res.status(500).json({ error: 'Could not upload the screenshot right now. You can still submit your UTR number instead.' });
  }

  const result = await ordersCollection().updateMany(
    { bookingId },
    { $set: { screenshotUrl: url, screenshotSubmittedAt: new Date().toISOString() } }
  );

  if (result.matchedCount === 0) {
    return res.status(404).json({ error: 'Booking not found.' });
  }

  res.json({ ok: true, url });
});

// ---------- admin endpoints ----------

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
  if (result.matchedCount === 0) return res.status(404).json({ error: 'Order not found.' });
  res.json({ ok: true });
});

app.post('/api/admin/bookings/:bookingId/status', requireAdmin, async (req, res) => {
  const { bookingId } = req.params;
  const { status } = req.body || {};
  if (!['pending', 'paid'].includes(status)) {
    return res.status(400).json({ error: 'Status must be "pending" or "paid".' });
  }
  const result = await ordersCollection().updateMany({ bookingId }, { $set: { status } });
  if (result.matchedCount === 0) return res.status(404).json({ error: 'Booking not found.' });
  res.json({ ok: true, updated: result.matchedCount });
});

app.delete('/api/admin/bookings/:bookingId', requireAdmin, async (req, res) => {
  const { bookingId } = req.params;
  const result = await ordersCollection().deleteMany({ bookingId });
  if (result.deletedCount === 0) return res.status(404).json({ error: 'Booking not found.' });
  res.json({ ok: true, deletedCount: result.deletedCount });
});

app.delete('/api/admin/orders', requireAdmin, async (req, res) => {
  const { confirm } = req.body || {};
  if (confirm !== 'DELETE ALL') {
    return res.status(400).json({ error: 'Confirmation phrase did not match. Nothing was deleted.' });
  }
  const result = await ordersCollection().deleteMany({});
  res.json({ ok: true, deletedCount: result.deletedCount });
});

app.get('/api/admin/orders/export', requireAdmin, async (req, res) => {
  const orders = await ordersCollection().find({}).sort({ createdAt: -1 }).toArray();
  const header = ['Order ID', 'Booking ID', 'Day', 'Lunch Type', 'Name', 'Phone', 'Email', 'Plates', 'Amount', 'Status', 'UTR', 'Screenshot URL', 'Razorpay Order ID', 'Razorpay Payment ID', 'Paid At', 'Created At'];
  const rows = orders.map(o => [
    o.orderId, o.bookingId, o.day, o.lunchType, o.name, o.phone, o.email, o.qty, o.amount, o.status,
    o.utr || '', o.screenshotUrl || '', o.razorpayOrderId || '', o.razorpayPaymentId || '', o.paidAt || '', o.createdAt
  ]);
  const csv = [header, ...rows]
    .map(r => r.map(v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="bhog-orders.csv"');
  res.send(csv);
});

const PORT = process.env.PORT || 3000;

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
