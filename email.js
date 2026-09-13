const nodemailer = require('nodemailer');

// Builds a transporter only if SMTP credentials are present in the
// environment. If they are not set, email sending is silently skipped so the
// order flow never breaks just because email isn't configured yet.
function getTransport() {
  const { SMTP_HOST, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;

  const port = Number(process.env.SMTP_PORT) || 465;
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS }
  });
}

async function sendOrderEmail(order) {
  const transport = getTransport();
  const sellerEmail = process.env.SELLER_EMAIL;
  if (!transport || !sellerEmail) return;

  await transport.sendMail({
    from: process.env.FROM_EMAIL || process.env.SMTP_USER,
    to: sellerEmail,
    subject: `New bhog order ${order.orderId} — ${order.qty} plate(s), ₹${order.amount}`,
    text:
`New Durga Pujo bhog order received.

Order ID : ${order.orderId}
Name     : ${order.name}
Phone    : ${order.phone}
Email    : ${order.email}
Plates   : ${order.qty}
Amount   : Rs. ${order.amount}
Placed at: ${order.createdAt}

View all orders in your admin dashboard (/admin.html).`
  });
}

module.exports = { sendOrderEmail };
