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

// ---------- Notification to the seller ----------

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

// ---------- Receipt to the customer ----------

async function sendCustomerReceiptEmail(order, upiLink) {
  const transport = getTransport();
  if (!transport || !order.email) return;

  const payLine = upiLink
    ? `Pay now via UPI: ${upiLink}\n(Or reopen your confirmation page and tap "Pay via UPI app" / scan the QR code.)`
    : `Please pay via UPI using the link/QR shown on your confirmation page.`;

  const text =
`Thank you, ${order.name}! Your bhog order is confirmed.

Order ID : ${order.orderId}
Plates   : ${order.qty}
Amount   : Rs. ${order.amount}

Your bhog lunch will be prepared by 1:30 PM.

${payLine}

Please keep your Order ID as your payment reference.

For queries contact Mr. Asesh Kumar Dasgupta (995894088) or Mr. Dipankar Ghosh.

— Utsav Socio-Cultural Trust`;

  const html = `
  <div style="font-family:Arial,sans-serif; max-width:480px; margin:0 auto; color:#2A1B14;">
    <h2 style="color:#7A2029; margin-bottom:4px;">Utsav Socio-Cultural Trust</h2>
    <p style="color:#6B5B4E; margin-top:0;">Lunch Bhog Booking — Order Receipt</p>
    <p>Thank you, <b>${order.name}</b>! Your bhog order is confirmed.</p>
    <table style="width:100%; border-collapse:collapse; margin:16px 0; background:#FBF3E6; border-radius:8px; overflow:hidden;">
      <tr><td style="padding:8px 12px; color:#6B5B4E;">Order ID</td><td style="padding:8px 12px; font-weight:bold;">${order.orderId}</td></tr>
      <tr><td style="padding:8px 12px; color:#6B5B4E;">Plates</td><td style="padding:8px 12px;">${order.qty}</td></tr>
      <tr><td style="padding:8px 12px; color:#6B5B4E;">Amount</td><td style="padding:8px 12px; font-weight:bold;">₹${order.amount}</td></tr>
    </table>
    <p><b>Your bhog lunch will be prepared by 1:30 PM.</b></p>
    ${upiLink
      ? `<p><a href="${upiLink}" style="display:inline-block; background:#A5303A; color:#fff; padding:10px 18px; border-radius:8px; text-decoration:none;">Pay ₹${order.amount} via UPI app</a></p>`
      : `<p>Please pay via UPI using the link/QR shown on your confirmation page.</p>`
    }
    <p style="font-size:13px; color:#6B5B4E;">Please keep your Order ID as your payment reference.</p>
    <p style="font-size:12px; color:#6B5B4E;">For queries contact Mr. Asesh Kumar Dasgupta (995894088) or Mr. Dipankar Ghosh.</p>
  </div>`;

  await transport.sendMail({
    from: process.env.FROM_EMAIL || process.env.SMTP_USER,
    to: order.email,
    subject: `Your bhog order ${order.orderId} is confirmed`,
    text,
    html
  });
}

module.exports = { sendOrderEmail, sendCustomerReceiptEmail };
