const nodemailer = require('nodemailer');


// ============================================================
// SMTP TRANSPORT
// ============================================================

let transporter = null;


// ------------------------------------------------------------
// CREATE SMTP TRANSPORT
// ------------------------------------------------------------

function getTransport() {

  // Reuse the existing transporter
  if (transporter) {
    return transporter;
  }


  const SMTP_HOST =
    String(
      process.env.SMTP_HOST || ''
    ).trim();


  const SMTP_PORT =
    Number(
      process.env.SMTP_PORT || 465
    );


  const SMTP_USER =
    String(
      process.env.SMTP_USER || ''
    ).trim();


  const SMTP_PASS =
    String(
      process.env.SMTP_PASS || ''
    ).trim();


  // ----------------------------------------------------------
  // CHECK CONFIGURATION
  // ----------------------------------------------------------

  if (
    !SMTP_HOST ||
    !SMTP_USER ||
    !SMTP_PASS
  ) {

    console.error(
      '=================================================='
    );

    console.error(
      'EMAIL ERROR: SMTP configuration is incomplete.'
    );

    console.error(
      `SMTP_HOST: ${SMTP_HOST ? 'SET' : 'MISSING'}`
    );

    console.error(
      `SMTP_PORT: ${SMTP_PORT || 'MISSING'}`
    );

    console.error(
      `SMTP_USER: ${SMTP_USER ? 'SET' : 'MISSING'}`
    );

    console.error(
      `SMTP_PASS: ${SMTP_PASS ? 'SET' : 'MISSING'}`
    );

    console.error(
      '=================================================='
    );

    return null;
  }


  // ----------------------------------------------------------
  // SECURE CONNECTION
  // ----------------------------------------------------------

  const secure =
    SMTP_PORT === 465;


  console.log(
    'Creating SMTP transporter...'
  );

  console.log(
    `SMTP Host: ${SMTP_HOST}`
  );

  console.log(
    `SMTP Port: ${SMTP_PORT}`
  );

  console.log(
    `SMTP Secure: ${secure}`
  );

  console.log(
    `SMTP User: ${SMTP_USER}`
  );


  // ----------------------------------------------------------
  // CREATE TRANSPORTER
  // ----------------------------------------------------------

  transporter =
    nodemailer.createTransport({

      host:
        SMTP_HOST,

      port:
        SMTP_PORT,

      secure,

      auth: {

        user:
          SMTP_USER,

        pass:
          SMTP_PASS

      },

      connectionTimeout:
        15000,

      greetingTimeout:
        15000,

      socketTimeout:
        20000

    });


  return transporter;
}


// ============================================================
// EMAIL ADDRESS
// ============================================================

function getFromEmail() {

  return (
    String(
      process.env.FROM_EMAIL || ''
    ).trim() ||
    String(
      process.env.SMTP_USER || ''
    ).trim()
  );
}


// ============================================================
// HTML ESCAPE
// ============================================================

function escapeHtml(value) {

  return String(
    value == null
      ? ''
      : value
  )
    .replace(
      /&/g,
      '&amp;'
    )
    .replace(
      /</g,
      '&lt;'
    )
    .replace(
      />/g,
      '&gt;'
    )
    .replace(
      /"/g,
      '&quot;'
    )
    .replace(
      /'/g,
      '&#039;'
    );
}


// ============================================================
// SEND EMAIL
// ============================================================

async function sendEmail({
  to,
  subject,
  text,
  html
}) {

  // ----------------------------------------------------------
  // VALIDATE RECIPIENT
  // ----------------------------------------------------------

  if (!to) {

    throw new Error(
      'Recipient email address is missing.'
    );
  }


  // ----------------------------------------------------------
  // GET TRANSPORT
  // ----------------------------------------------------------

  const transport =
    getTransport();


  if (!transport) {

    throw new Error(
      'SMTP transport could not be created. Check SMTP_HOST, SMTP_PORT, SMTP_USER and SMTP_PASS.'
    );
  }


  // ----------------------------------------------------------
  // FROM ADDRESS
  // ----------------------------------------------------------

  const from =
    getFromEmail();


  if (!from) {

    throw new Error(
      'FROM_EMAIL and SMTP_USER are both missing.'
    );
  }


  console.log(
    '--------------------------------------------------'
  );

  console.log(
    'Attempting to send email...'
  );

  console.log(
    `From: ${from}`
  );

  console.log(
    `To: ${to}`
  );

  console.log(
    `Subject: ${subject}`
  );


  try {

    const info =
      await transport.sendMail({

        from,

        to,

        subject,

        text,

        html

      });


    console.log(
      'EMAIL SENT SUCCESSFULLY'
    );

    console.log(
      `Message ID: ${info.messageId}`
    );

    console.log(
      `Accepted: ${JSON.stringify(info.accepted)}`
    );

    console.log(
      `Rejected: ${JSON.stringify(info.rejected)}`
    );

    console.log(
      '--------------------------------------------------'
    );


    return info;

  } catch (error) {

    console.error(
      '=================================================='
    );

    console.error(
      'EMAIL SEND FAILED'
    );

    console.error(
      `Recipient: ${to}`
    );

    console.error(
      `Subject: ${subject}`
    );

    console.error(
      `Error Code: ${error.code || 'N/A'}`
    );

    console.error(
      `Error Command: ${error.command || 'N/A'}`
    );

    console.error(
      `Error Response: ${error.response || 'N/A'}`
    );

    console.error(
      `Error Message: ${error.message || error}`
    );

    console.error(
      '=================================================='
    );

    throw error;
  }
}


// ============================================================
// SELLER PAYMENT CONFIRMATION
// ============================================================

async function sendOrderEmail(
  booking
) {

  if (!booking) {

    throw new Error(
      'Booking information is missing.'
    );
  }


  const sellerEmail =
    String(
      process.env.SELLER_EMAIL || ''
    ).trim();


  if (!sellerEmail) {

    throw new Error(
      'SELLER_EMAIL is not configured.'
    );
  }


  // ----------------------------------------------------------
  // ORDER DETAILS
  // ----------------------------------------------------------

  const dayOrders =
    Array.isArray(
      booking.dayOrders
    )
      ? booking.dayOrders
      : [];


  const dayText =
    dayOrders
      .map(
        order =>
          `- ${order.day}: ${order.qty} plate(s) — ₹${order.amount}`
      )
      .join('\n');


  const orderIds =
    dayOrders
      .map(
        order =>
          `${order.day}: ${order.orderId || 'N/A'}`
      )
      .join('\n');


  // ----------------------------------------------------------
  // PLAIN TEXT EMAIL
  // ----------------------------------------------------------

  const text =

`UTSAV SOCIO-CULTURAL TRUST
BHOG BOOKING — PAYMENT CONFIRMED

Booking ID:
${booking.bookingId || 'N/A'}

Special UTSAV Order ID(s):
${orderIds || 'N/A'}

Name:
${booking.name || 'N/A'}

Phone:
${booking.phone || 'N/A'}

Email:
${booking.email || 'N/A'}

Lunch Type:
${booking.lunchType || 'N/A'}

Days:
${dayText || 'N/A'}

Total Paid:
Rs. ${booking.totalAmount || 0}

PayU Payment ID:
${booking.payuPaymentId || 'Not provided'}

PayU Transaction ID:
${booking.payuTxnId || 'Not provided'}

Paid At:
${booking.paidAt || 'Not provided'}

The payment has been successfully verified by the UTSAV server.

Please open the seller dashboard for the complete booking details.
`;


  // ----------------------------------------------------------
  // HTML EMAIL
  // ----------------------------------------------------------

  const htmlDayRows =
    dayOrders
      .map(
        order => `

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
  text-align:center;
">
  ${escapeHtml(order.qty)}
</td>

<td style="
  padding:10px;
  border:1px solid #ddd;
  text-align:right;
">
  ₹${escapeHtml(order.amount)}
</td>

<td style="
  padding:10px;
  border:1px solid #ddd;
">
  ${escapeHtml(order.orderId || 'N/A')}
</td>

</tr>

`
      )
      .join('');


  const html = `

<!DOCTYPE html>

<html>

<head>

<meta charset="UTF-8">

<meta
  name="viewport"
  content="width=device-width, initial-scale=1.0"
>

<title>
UTSAV Payment Confirmed
</title>

</head>


<body style="
  margin:0;
  padding:20px;
  background:#FBF3E6;
  font-family:Arial,Helvetica,sans-serif;
  color:#2A1B14;
">

<div style="
  max-width:700px;
  margin:auto;
  background:#ffffff;
  border-radius:12px;
  padding:30px;
  border:1px solid #DECBAA;
">

<h1 style="
  color:#1F4B3F;
  margin-top:0;
">
  Payment Confirmed
</h1>


<p>
The following UTSAV Bhog booking has been successfully paid and verified.
</p>


<h3>
Booking Information
</h3>


<table style="
  width:100%;
  border-collapse:collapse;
  margin-bottom:25px;
">

<tr>
<td style="padding:8px;font-weight:bold;">
Booking ID
</td>

<td style="padding:8px;">
${escapeHtml(booking.bookingId || 'N/A')}
</td>
</tr>


<tr>
<td style="padding:8px;font-weight:bold;">
Name
</td>

<td style="padding:8px;">
${escapeHtml(booking.name || 'N/A')}
</td>
</tr>


<tr>
<td style="padding:8px;font-weight:bold;">
Phone
</td>

<td style="padding:8px;">
${escapeHtml(booking.phone || 'N/A')}
</td>
</tr>


<tr>
<td style="padding:8px;font-weight:bold;">
Email
</td>

<td style="padding:8px;">
${escapeHtml(booking.email || 'N/A')}
</td>
</tr>


<tr>
<td style="padding:8px;font-weight:bold;">
Lunch Type
</td>

<td style="padding:8px;">
${escapeHtml(booking.lunchType || 'N/A')}
</td>
</tr>


</table>


<h3>
Orders
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
  text-align:left;
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
  text-align:right;
">
Amount
</th>

<th style="
  padding:10px;
  border:1px solid #ddd;
  text-align:left;
">
Order ID
</th>

</tr>

</thead>


<tbody>

${htmlDayRows}

</tbody>

</table>


<h2 style="
  margin-top:25px;
  color:#A5303A;
">

Total Paid:
₹${escapeHtml(booking.totalAmount || 0)}

</h2>


<p>
<strong>PayU Payment ID:</strong>
${escapeHtml(booking.payuPaymentId || 'Not provided')}
</p>


<p>
<strong>PayU Transaction ID:</strong>
${escapeHtml(booking.payuTxnId || 'Not provided')}
</p>


<p>
<strong>Paid At:</strong>
${escapeHtml(booking.paidAt || 'Not provided')}
</p>


<hr style="
  border:none;
  border-top:1px solid #ddd;
  margin:25px 0;
">


<p>
The payment has been successfully verified by the UTSAV server.
</p>


<p>
Please open the seller dashboard for complete booking details.
</p>


</div>

</body>

</html>

`;


  return sendEmail({

    to:
      sellerEmail,

    subject:
      `PAYMENT CONFIRMED — ${booking.bookingId || 'UTSAV Booking'}`,

    text,

    html

  });

}


// ============================================================
// CUSTOMER RECEIPT
// ============================================================

async function sendCustomerReceiptEmail(
  booking
) {

  if (!booking) {

    throw new Error(
      'Booking information is missing.'
    );
  }


  const customerEmail =
    String(
      booking.email || ''
    ).trim();


  if (!customerEmail) {

    throw new Error(
      'Customer email address is missing.'
    );
  }


  // ----------------------------------------------------------
  // ORDER DETAILS
  // ----------------------------------------------------------

  const dayOrders =
    Array.isArray(
      booking.dayOrders
    )
      ? booking.dayOrders
      : [];


  const dayText =
    dayOrders
      .map(
        order =>
          `- ${order.day}: ${order.qty} plate(s) — ₹${order.amount}`
      )
      .join('\n');


  const orderIds =
    dayOrders
      .map(
        order =>
          `${order.day}: ${order.orderId || 'N/A'}`
      )
      .join('\n');


  // ----------------------------------------------------------
  // PLAIN TEXT
  // ----------------------------------------------------------

  const text =

`Dear ${booking.name || 'Customer'},

Thank you for booking Bhog with Utsav Socio-Cultural Trust.

Your payment has been successfully verified.

BOOKING ID:
${booking.bookingId || 'N/A'}

SPECIAL UTSAV ORDER ID(s):
${orderIds || 'N/A'}

BOOKING DETAILS:

${dayText || 'N/A'}

Lunch Type:
${booking.lunchType || 'N/A'}

Total Paid:
Rs. ${booking.totalAmount || 0}

PayU Payment ID:
${booking.payuPaymentId || 'Not provided'}

PayU Transaction ID:
${booking.payuTxnId || 'Not provided'}

Paid At:
${booking.paidAt || 'Not provided'}

Please keep your UTSAV Order ID safely.

Thank you,

Utsav Socio-Cultural Trust
`;


  // ----------------------------------------------------------
  // HTML
  // ----------------------------------------------------------

  const htmlDayRows =
    dayOrders
      .map(
        order => `

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
  text-align:center;
">
  ${escapeHtml(order.qty)}
</td>

<td style="
  padding:10px;
  border:1px solid #ddd;
  text-align:right;
">
  ₹${escapeHtml(order.amount)}
</td>

<td style="
  padding:10px;
  border:1px solid #ddd;
">
  ${escapeHtml(order.orderId || 'N/A')}
</td>

</tr>

`
      )
      .join('');


  const html = `

<!DOCTYPE html>

<html>

<head>

<meta charset="UTF-8">

<meta
  name="viewport"
  content="width=device-width, initial-scale=1.0"
>

<title>
UTSAV Bhog Booking Confirmed
</title>

</head>


<body style="
  margin:0;
  padding:20px;
  background:#FBF3E6;
  font-family:Arial,Helvetica,sans-serif;
  color:#2A1B14;
">

<div style="
  max-width:700px;
  margin:auto;
  background:#ffffff;
  border-radius:12px;
  padding:30px;
  border:1px solid #DECBAA;
">

<h1 style="
  color:#1F4B3F;
  margin-top:0;
">
  Payment Successful
</h1>


<p>
Dear ${escapeHtml(booking.name || 'Customer')},
</p>


<p>
Thank you for booking Bhog with Utsav Socio-Cultural Trust.
</p>


<p>
Your payment has been successfully verified.
</p>


<div style="
  background:#F8F2E8;
  padding:18px;
  border-radius:10px;
  margin:20px 0;
">

<p style="margin:6px 0;">
<strong>Booking ID:</strong>
${escapeHtml(booking.bookingId || 'N/A')}
</p>


<p style="margin:6px 0;">
<strong>Lunch Type:</strong>
${escapeHtml(booking.lunchType || 'N/A')}
</p>


<p style="margin:6px 0;">
<strong>Total Paid:</strong>
₹${escapeHtml(booking.totalAmount || 0)}
</p>

</div>


<h3>
Your UTSAV Order ID(s)
</h3>


<div style="
  background:#FFF8E8;
  border:1px solid #E5C97A;
  padding:15px;
  border-radius:8px;
">

${dayOrders
  .map(
    order => `

<p style="
  margin:7px 0;
">

<strong>
${escapeHtml(order.day)}
</strong>

:
${escapeHtml(order.orderId || 'N/A')}

</p>

`
  )
  .join('')}

</div>


<h3 style="
  margin-top:25px;
">
Booking Details
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
  text-align:left;
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
  text-align:right;
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

${htmlDayRows}

</tbody>

</table>


<p style="
  margin-top:25px;
">

<strong>
PayU Payment ID:
</strong>

${escapeHtml(
  booking.payuPaymentId ||
  'Not provided'
)}

</p>


<p>

<strong>
PayU Transaction ID:
</strong>

${escapeHtml(
  booking.payuTxnId ||
  'Not provided'
)}

</p>


<p>

<strong>
Paid At:
</strong>

${escapeHtml(
  booking.paidAt ||
  'Not provided'
)}

</p>


<hr style="
  border:none;
  border-top:1px solid #ddd;
  margin:25px 0;
">


<p>
Please keep your UTSAV Order ID safely.
</p>


<p>
Thank you,
</p>


<p>
<strong>
Utsav Socio-Cultural Trust
</strong>
</p>


</div>

</body>

</html>

`;


  return sendEmail({

    to:
      customerEmail,

    subject:
      `UTSAV Bhog Booking Confirmed — ${booking.bookingId || 'Booking'}`,

    text,

    html

  });

}


// ============================================================
// TEST EMAIL FUNCTION
// ============================================================
//
// You can call this from another file if needed:
//
// const { testEmail } = require('./email');
// await testEmail('your@email.com');
//
// ============================================================

async function testEmail(
  recipient
) {

  if (!recipient) {

    throw new Error(
      'Test email recipient is required.'
    );
  }


  return sendEmail({

    to:
      recipient,

    subject:
      'UTSAV Email System Test',

    text:

`UTSAV SOCIO-CULTURAL TRUST

This is a test email from the UTSAV Bhog Booking backend.

If you received this email, your SMTP configuration is working correctly.
`,

    html: `

<!DOCTYPE html>

<html>

<body style="
  font-family:Arial,sans-serif;
  padding:30px;
">

<h2>
UTSAV Email System Test
</h2>

<p>
This is a test email from the UTSAV Bhog Booking backend.
</p>

<p>
If you received this email, your SMTP configuration is working correctly.
</p>

</body>

</html>

`

  });

}


// ============================================================
// EXPORTS
// ============================================================

module.exports = {

  sendOrderEmail,

  sendCustomerReceiptEmail,

  testEmail

};
