require('dotenv').config();

/*
============================================================
BREVO EMAIL SERVICE
============================================================
Uses Brevo Transactional Email API.

Required environment variables:

BREVO_API_KEY=your_brevo_api_key
BREVO_SENDER_EMAIL=your_verified_sender_email

Optional:
BREVO_SENDER_NAME=Utsav Socio-Cultural Trust
ADMIN_EMAIL=your_admin_email

IMPORTANT:
Do NOT put your Brevo API key directly in this file.
Keep it in Render Environment Variables.
============================================================
*/

const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';

const BREVO_API_KEY =
  String(process.env.BREVO_API_KEY || '').trim();

const BREVO_SENDER_EMAIL =
  String(
    process.env.BREVO_SENDER_EMAIL ||
    process.env.BREVO_SENDER_EMAIL_ADDRESS ||
    ''
  ).trim();

const BREVO_SENDER_NAME =
  String(
    process.env.BREVO_SENDER_NAME ||
    'Utsav Socio-Cultural Trust'
  ).trim();

const ADMIN_EMAIL =
  String(
    process.env.ADMIN_EMAIL ||
    process.env.BREVO_SENDER_EMAIL ||
    ''
  ).trim();


// ============================================================
// CONFIGURATION CHECK
// ============================================================

console.log('==========================================');
console.log('BREVO EMAIL CONFIGURATION');
console.log('==========================================');

console.log(
  'Brevo API Key configured:',
  Boolean(BREVO_API_KEY)
);

console.log(
  'Brevo Sender Email:',
  BREVO_SENDER_EMAIL || 'NOT SET'
);

console.log(
  'Brevo Sender Name:',
  BREVO_SENDER_NAME
);

console.log(
  'Admin Email:',
  ADMIN_EMAIL || 'NOT SET'
);

console.log('==========================================');


// ============================================================
// HTML ESCAPE
// ============================================================

function escapeHtml(value) {

  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}


// ============================================================
// SEND EMAIL THROUGH BREVO
// ============================================================

async function sendBrevoEmail({
  to,
  toName = '',
  subject,
  htmlContent,
  textContent = ''
}) {

  if (!BREVO_API_KEY) {

    throw new Error(
      'BREVO_API_KEY is missing from environment variables.'
    );
  }


  if (!BREVO_SENDER_EMAIL) {

    throw new Error(
      'BREVO_SENDER_EMAIL is missing from environment variables.'
    );
  }


  if (!to) {

    throw new Error(
      'Recipient email address is missing.'
    );
  }


  console.log('------------------------------------------');
  console.log('BREVO EMAIL');
  console.log('------------------------------------------');

  console.log(
    'From:',
    `${BREVO_SENDER_NAME} <${BREVO_SENDER_EMAIL}>`
  );

  console.log(
    'To:',
    to
  );

  console.log(
    'Subject:',
    subject
  );

  console.log(
    'Sending through Brevo API...'
  );


  const response = await fetch(
    BREVO_API_URL,
    {
      method: 'POST',

      headers: {
        'accept': 'application/json',
        'api-key': BREVO_API_KEY,
        'content-type': 'application/json'
      },

      body: JSON.stringify({

        sender: {
          name: BREVO_SENDER_NAME,
          email: BREVO_SENDER_EMAIL
        },

        to: [
          {
            email: String(to).trim(),
            name: String(toName || '').trim()
          }
        ],

        subject,

        htmlContent,

        ...(textContent
          ? { textContent }
          : {})

      })
    }
  );


  const responseText =
    await response.text();


  let responseData = {};

  try {

    responseData =
      responseText
        ? JSON.parse(responseText)
        : {};

  } catch {

    responseData = {
      raw: responseText
    };

  }


  if (!response.ok) {

    console.error(
      'BREVO EMAIL FAILED'
    );

    console.error(
      'HTTP Status:',
      response.status
    );

    console.error(
      'Brevo Response:',
      JSON.stringify(
        responseData,
        null,
        2
      )
    );

    throw new Error(
      `Brevo email failed (${response.status}): ${
        responseData.message ||
        responseText ||
        'Unknown Brevo error'
      }`
    );
  }


  console.log(
    'BREVO EMAIL SENT SUCCESSFULLY'
  );

  console.log(
    'Brevo Message ID:',
    responseData.messageId || 'N/A'
  );

  console.log('------------------------------------------');


  return responseData;
}


// ============================================================
// SELLER / ADMIN EMAIL
// ============================================================

async function sendOrderEmail(booking) {

  if (!ADMIN_EMAIL) {

    throw new Error(
      'ADMIN_EMAIL is not configured.'
    );
  }


  console.log('==========================================');
  console.log('Attempting to send SELLER email...');
  console.log(
    'Seller recipient:',
    ADMIN_EMAIL
  );
  console.log('==========================================');


  const rows =
    (booking.dayOrders || [])
      .map(order => {

        return `
          <tr>
            <td style="
              padding:10px;
              border:1px solid #ddd;
            ">
              ${escapeHtml(order.day)}
            </td>

            <td style="
              padding:10px;
              border:1px solid #ddd;
            ">
              ${escapeHtml(order.qty)}
            </td>

            <td style="
              padding:10px;
              border:1px solid #ddd;
            ">
              ₹${escapeHtml(order.amount)}
            </td>

            <td style="
              padding:10px;
              border:1px solid #ddd;
            ">
              ${escapeHtml(order.orderId || 'Pending')}
            </td>
          </tr>
        `;

      })
      .join('');


  const htmlContent = `

<!DOCTYPE html>

<html>

<head>

<meta charset="UTF-8">

</head>

<body style="
  font-family:Arial,sans-serif;
  background:#f7f3ed;
  padding:20px;
">

<div style="
  max-width:700px;
  margin:auto;
  background:white;
  padding:30px;
  border-radius:12px;
">

<h2 style="
  color:#8f2632;
">
New Bhog Booking Received
</h2>


<p>
A new Bhog booking has been successfully paid.
</p>


<h3>Booking Details</h3>

<table style="
  width:100%;
  border-collapse:collapse;
">

<tr>
<td><strong>Booking ID</strong></td>
<td>${escapeHtml(booking.bookingId)}</td>
</tr>

<tr>
<td><strong>Name</strong></td>
<td>${escapeHtml(booking.name)}</td>
</tr>

<tr>
<td><strong>Phone</strong></td>
<td>${escapeHtml(booking.phone)}</td>
</tr>

<tr>
<td><strong>Email</strong></td>
<td>${escapeHtml(booking.email)}</td>
</tr>

<tr>
<td><strong>Lunch Type</strong></td>
<td>${escapeHtml(booking.lunchType)}</td>
</tr>

<tr>
<td><strong>Total Amount</strong></td>
<td>₹${escapeHtml(booking.totalAmount)}</td>
</tr>

<tr>
<td><strong>PayU Transaction ID</strong></td>
<td>${escapeHtml(booking.payuTxnId)}</td>
</tr>

<tr>
<td><strong>PayU Payment ID</strong></td>
<td>${escapeHtml(booking.payuPaymentId)}</td>
</tr>

</table>


<h3>Orders</h3>

<table style="
  width:100%;
  border-collapse:collapse;
">

<thead>

<tr>

<th style="
  padding:10px;
  border:1px solid #ddd;
">
Day
</th>

<th style="
  padding:10px;
  border:1px solid #ddd;
">
Plates
</th>

<th style="
  padding:10px;
  border:1px solid #ddd;
">
Amount
</th>

<th style="
  padding:10px;
  border:1px solid #ddd;
">
Order ID
</th>

</tr>

</thead>

<tbody>

${rows}

</tbody>

</table>


<p style="
  margin-top:25px;
  color:#666;
">

Payment Status:
<strong>PAID</strong>

</p>

</div>

</body>

</html>

`;


  const textContent = `

New Bhog Booking Received

Booking ID: ${booking.bookingId}

Name: ${booking.name}

Phone: ${booking.phone}

Email: ${booking.email}

Lunch Type: ${booking.lunchType}

Total Amount: ₹${booking.totalAmount}

PayU Transaction ID: ${booking.payuTxnId}

PayU Payment ID: ${booking.payuPaymentId}

Orders:

${(booking.dayOrders || [])
  .map(order =>
    `${order.day}: ${order.qty} plates - ₹${order.amount} - ${order.orderId || 'Pending'}`
  )
  .join('\n')}

Payment Status: PAID

`;


  return sendBrevoEmail({

    to: ADMIN_EMAIL,

    toName:
      'Utsav Admin',

    subject:
      `New UTSAV Bhog Booking - ${booking.bookingId}`,

    htmlContent,

    textContent

  });
}


// ============================================================
// CUSTOMER RECEIPT EMAIL
// ============================================================

async function sendCustomerReceiptEmail(
  booking,
  attachment = null
) {

  const customerEmail =
    String(
      booking.email || ''
    ).trim();


  if (!customerEmail) {

    throw new Error(
      'Customer email is missing.'
    );
  }


  console.log('==========================================');
  console.log(
    'Attempting to send CUSTOMER receipt email...'
  );

  console.log(
    'Customer recipient:',
    customerEmail
  );

  console.log('==========================================');


  const rows =
    (booking.dayOrders || [])
      .map(order => {

        return `
          <tr>

            <td style="
              padding:10px;
              border:1px solid #ddd;
            ">
              ${escapeHtml(order.day)}
            </td>

            <td style="
              padding:10px;
              border:1px solid #ddd;
            ">
              ${escapeHtml(order.qty)}
            </td>

            <td style="
              padding:10px;
              border:1px solid #ddd;
            ">
              ₹${escapeHtml(order.amount)}
            </td>

            <td style="
              padding:10px;
              border:1px solid #ddd;
              font-weight:bold;
            ">
              ${escapeHtml(order.orderId)}
            </td>

          </tr>
        `;

      })
      .join('');


  const htmlContent = `

<!DOCTYPE html>

<html>

<head>

<meta charset="UTF-8">

</head>

<body style="
  font-family:Arial,sans-serif;
  background:#f7f3ed;
  padding:20px;
">

<div style="
  max-width:700px;
  margin:auto;
  background:white;
  padding:30px;
  border-radius:12px;
">

<h1 style="
  color:#8f2632;
  text-align:center;
">
UTSAV Bhog Booking Confirmed
</h1>


<p style="
  font-size:18px;
">

Dear ${escapeHtml(booking.name)},

</p>


<p>

Your payment has been successfully received and your Bhog booking is confirmed.

</p>


<div style="
  background:#f8f1e6;
  padding:18px;
  border-radius:10px;
  margin:20px 0;
">

<p>
<strong>Booking ID:</strong>
${escapeHtml(booking.bookingId)}
</p>

<p>
<strong>Total Amount:</strong>
₹${escapeHtml(booking.totalAmount)}
</p>

<p>
<strong>Payment Status:</strong>
<span style="color:#1f7a4d;">
PAID
</span>
</p>

</div>


<h3>
Your Order Details
</h3>


<table style="
  width:100%;
  border-collapse:collapse;
">

<thead>

<tr>

<th style="
  padding:10px;
  border:1px solid #ddd;
">
Day
</th>

<th style="
  padding:10px;
  border:1px solid #ddd;
">
Plates
</th>

<th style="
  padding:10px;
  border:1px solid #ddd;
">
Amount
</th>

<th style="
  padding:10px;
  border:1px solid #ddd;
">
Order ID
</th>

</tr>

</thead>


<tbody>

${rows}

</tbody>

</table>


<div style="
  margin-top:25px;
  padding:18px;
  background:#f8f1e6;
  border-radius:10px;
">

<p>
<strong>PayU Transaction ID:</strong>
${escapeHtml(booking.payuTxnId)}
</p>

<p>
<strong>PayU Payment ID:</strong>
${escapeHtml(booking.payuPaymentId)}
</p>

<p>
<strong>Payment Date:</strong>
${escapeHtml(booking.paidAt)}
</p>

</div>


<p style="
  margin-top:30px;
">

Thank you for booking Bhog with Utsav Socio-Cultural Trust.

</p>


<p style="
  color:#777;
  font-size:13px;
">

Please keep this email for your records.

</p>

</div>

</body>

</html>

`;


  const textContent = `

UTSAV Bhog Booking Confirmed

Dear ${booking.name},

Your payment has been successfully received and your Bhog booking is confirmed.

Booking ID:
${booking.bookingId}

Total Amount:
₹${booking.totalAmount}

Payment Status:
PAID

Order Details:

${(booking.dayOrders || [])
  .map(order =>
    `${order.day}: ${order.qty} plates - ₹${order.amount} - Order ID: ${order.orderId}`
  )
  .join('\n')}

PayU Transaction ID:
${booking.payuTxnId}

PayU Payment ID:
${booking.payuPaymentId}

Payment Date:
${booking.paidAt}

Thank you for booking Bhog with Utsav Socio-Cultural Trust.

`;


  return sendBrevoEmail({

    to: customerEmail,

    toName:
      booking.name,

    subject:
      `UTSAV Bhog Booking Confirmed - ${booking.bookingId}`,

    htmlContent,

    textContent

  });

}


// ============================================================
// EXPORTS
// ============================================================

module.exports = {

  sendOrderEmail,

  sendCustomerReceiptEmail

};
