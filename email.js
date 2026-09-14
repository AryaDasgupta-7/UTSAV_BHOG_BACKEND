// Uses Brevo's HTTP API (not SMTP) to send email.
// Render's free tier blocks all outbound SMTP connections (ports 25, 465, 587)
// as an anti-spam measure, so any nodemailer/SMTP setup will always time out
// there. Brevo's API sends over plain HTTPS instead, which is never blocked.

const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';

function getSender() {
  const email = process.env.BREVO_SENDER_EMAIL;
  if (!email) return null;
  return {
    name: process.env.BREVO_SENDER_NAME || 'Utsav Socio-Cultural Trust',
    email
  };
}

// Sends one email via Brevo. Silently does nothing if not configured yet,
// so the order flow never breaks just because email isn't set up.
async function sendViaBrevo({ to, toName, subject, text, html }) {
  const apiKey = process.env.BREVO_API_KEY;
  const sender = getSender();
  if (!apiKey || !sender) return;

  const res = await fetch(BREVO_API_URL, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'api-key': apiKey,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      sender,
      to: [{ email: to, name: toName || to }],
      subject,
      textContent: text,
      ...(html ? { htmlContent: html } : {})
    })
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Brevo API error ${res.status}: ${body}`);
  }
}

// ---------- Notification to the seller ----------

async function sendOrderEmail(order) {
  const sellerEmail = process.env.SELLER_EMAIL;
  if (!sellerEmail) return;

  await sendViaBrevo({
    to: sellerEmail,
    toName: 'Seller',
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
  if (!order.email) return;

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

  await sendViaBrevo({
    to: order.email,
    toName: order.name,
    subject: `Your bhog order ${order.orderId} is confirmed`,
    text,
    html
  });
}

module.exports = { sendOrderEmail, sendCustomerReceiptEmail };
