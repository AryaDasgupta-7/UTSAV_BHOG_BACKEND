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

// Plain-text day-by-day breakdown, shared by both emails.
function dayLines(booking) {
  return booking.dayOrders
    .map(o => `  - ${o.day}: ${o.qty} plate(s), ₹${o.amount}  (Order ID: ${o.orderId})`)
    .join('\n');
}

// HTML day-by-day breakdown, shared by both emails.
function dayRowsHtml(booking) {
  return booking.dayOrders
    .map(o => `
      <tr>
        <td style="padding:8px 12px; color:#6B5B4E;">${o.day}</td>
        <td style="padding:8px 12px;">${o.qty}</td>
        <td style="padding:8px 12px;">₹${o.amount}</td>
        <td style="padding:8px 12px; font-size:12px; color:#6B5B4E;">${o.orderId}</td>
      </tr>`)
    .join('');
}

// ---------- Notification to the seller ----------

async function sendOrderEmail(booking) {
  const sellerEmail = process.env.SELLER_EMAIL;
  if (!sellerEmail) return;

  await sendViaBrevo({
    to: sellerEmail,
    toName: 'Seller',
    subject: `New bhog booking ${booking.bookingId} — ₹${booking.totalAmount}`,
    text:
`New Durga Pujo bhog booking received.

Booking ID : ${booking.bookingId}
Name       : ${booking.name}
Phone      : ${booking.phone}
Email      : ${booking.email}
Lunch type : ${booking.lunchType}

Days booked:
${dayLines(booking)}

Total amount: Rs. ${booking.totalAmount}
Placed at   : ${booking.createdAt}

View all orders in your admin dashboard (/admin.html).`
  });
}

// ---------- Receipt to the customer ----------

async function sendCustomerReceiptEmail(booking, upiLink) {
  if (!booking.email) return;

  const payLine = upiLink
    ? `Pay now via UPI: ${upiLink}\n(Or reopen your confirmation page and tap "Pay via UPI app" / scan the QR code.)`
    : `Please pay via UPI using the link/QR shown on your confirmation page.`;

  const text =
`Thank you, ${booking.name}! Your bhog booking is confirmed.

Booking ID : ${booking.bookingId}
Lunch type : ${booking.lunchType}

Days booked:
${dayLines(booking)}

Total amount: Rs. ${booking.totalAmount}

Your bhog lunch will be prepared by 1:30 PM on each booked day.

${payLine}

Please keep your Booking ID as your payment reference.

For queries contact Mr. Asesh Kumar Dasgupta (995894088) or Mr. Dipankar Ghosh.

— Utsav Socio-Cultural Trust`;

  const html = `
  <div style="font-family:Arial,sans-serif; max-width:520px; margin:0 auto; color:#2A1B14;">
    <h2 style="color:#7A2029; margin-bottom:4px;">Utsav Socio-Cultural Trust</h2>
    <p style="color:#6B5B4E; margin-top:0;">Lunch Bhog Booking — Receipt</p>
    <p>Thank you, <b>${booking.name}</b>! Your bhog booking is confirmed.</p>
    <table style="width:100%; border-collapse:collapse; margin:12px 0; background:#FBF3E6; border-radius:8px; overflow:hidden;">
      <tr><td style="padding:8px 12px; color:#6B5B4E;">Booking ID</td><td style="padding:8px 12px; font-weight:bold;">${booking.bookingId}</td></tr>
      <tr><td style="padding:8px 12px; color:#6B5B4E;">Lunch type</td><td style="padding:8px 12px;">${booking.lunchType}</td></tr>
    </table>
    <table style="width:100%; border-collapse:collapse; margin:12px 0;">
      <thead>
        <tr style="background:#EFE3D0;">
          <th style="padding:8px 12px; text-align:left;">Day</th>
          <th style="padding:8px 12px; text-align:left;">Plates</th>
          <th style="padding:8px 12px; text-align:left;">Amount</th>
          <th style="padding:8px 12px; text-align:left;">Order ID</th>
        </tr>
      </thead>
      <tbody>${dayRowsHtml(booking)}</tbody>
    </table>
    <p style="font-size:16px;"><b>Total: ₹${booking.totalAmount}</b></p>
    <p><b>Your bhog lunch will be prepared by 1:30 PM on each booked day.</b></p>
    ${upiLink
      ? `<p><a href="${upiLink}" style="display:inline-block; background:#A5303A; color:#fff; padding:10px 18px; border-radius:8px; text-decoration:none;">Pay ₹${booking.totalAmount} via UPI app</a></p>`
      : `<p>Please pay via UPI using the link/QR shown on your confirmation page.</p>`
    }
    <p style="font-size:13px; color:#6B5B4E;">Please keep your Booking ID as your payment reference.</p>
    <p style="font-size:12px; color:#6B5B4E;">For queries contact Mr. Asesh Kumar Dasgupta (995894088) or Mr. Dipankar Ghosh.</p>
  </div>`;

  await sendViaBrevo({
    to: booking.email,
    toName: booking.name,
    subject: `Your bhog booking ${booking.bookingId} is confirmed`,
    text,
    html
  });
}

module.exports = { sendOrderEmail, sendCustomerReceiptEmail };
