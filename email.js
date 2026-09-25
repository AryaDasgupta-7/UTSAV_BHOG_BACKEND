require('dotenv').config();

const nodemailer = require('nodemailer');


// ============================================================
// EMAIL CONFIGURATION
// ============================================================

const SMTP_HOST =
  String(process.env.SMTP_HOST || 'smtp.gmail.com').trim();

const SMTP_PORT =
  Number(process.env.SMTP_PORT || 587);

const SMTP_USER =
  String(process.env.SMTP_USER || '').trim();

const SMTP_PASS =
  String(process.env.SMTP_PASS || '').trim();

const FROM_EMAIL =
  String(
    process.env.FROM_EMAIL ||
    SMTP_USER
  ).trim();

const SELLER_EMAIL =
  String(
    process.env.SELLER_EMAIL ||
    SMTP_USER
  ).trim();


// ============================================================
// CONFIGURATION CHECK
// ============================================================

console.log('==========================================');
console.log('EMAIL CONFIGURATION');
console.log('==========================================');

console.log(
  `SMTP Host: ${SMTP_HOST}`
);

console.log(
  `SMTP Port: ${SMTP_PORT}`
);

console.log(
  `SMTP Secure: ${SMTP_PORT === 465}`
);

console.log(
  `SMTP User: ${SMTP_USER || '[MISSING]'}`
);

console.log(
  `SMTP Password configured: ${Boolean(SMTP_PASS)}`
);

console.log(
  `From Email: ${FROM_EMAIL || '[MISSING]'}`
);

console.log(
  `Seller Email: ${SELLER_EMAIL || '[MISSING]'}`
);

console.log('==========================================');


// ============================================================
// CREATE SMTP TRANSPORTER
// ============================================================

function createTransporter() {

  if (!SMTP_USER) {
    throw new Error(
      'SMTP_USER is missing from environment variables.'
    );
  }

  if (!SMTP_PASS) {
    throw new Error(
      'SMTP_PASS is missing from environment variables.'
    );
  }

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
    `SMTP Secure: ${SMTP_PORT === 465}`
  );

  console.log(
    `SMTP User: ${SMTP_USER}`
  );


  const transporter =
    nodemailer.createTransport({

      host: SMTP_HOST,

      port: SMTP_PORT,

      secure:
        SMTP_PORT === 465,

      auth: {

        user:
          SMTP_USER,

        pass:
          SMTP_PASS

      },

      requireTLS:
        SMTP_PORT === 587,

      connectionTimeout:
        20000,

      greetingTimeout:
        20000,

      socketTimeout:
        20000,

      tls: {

        minVersion:
          'TLSv1.2'

      }

    });


  return transporter;
}


// ============================================================
// VERIFY SMTP CONNECTION
// ============================================================

async function verifySMTP() {

  try {

    console.log(
      'Verifying SMTP connection...'
    );

    const transporter =
      createTransporter();

    await transporter.verify();

    console.log(
      'SMTP connection verified successfully.'
    );

    return true;

  } catch (error) {

    console.error(
      '=========================================='
    );

    console.error(
      'SMTP VERIFICATION FAILED'
    );

    console.error(
      '=========================================='
    );

    console.error(
      'Error code:',
      error.code
    );

    console.error(
      'Error command:',
      error.command
    );

    console.error(
      'Error response:',
      error.response
    );

    console.error(
      'Error message:',
      error.message
    );

    console.error(
      'Full error:',
      error
    );

    console.error(
      '=========================================='
    );

    return false;
  }
}


// ============================================================
// SEND EMAIL
// ============================================================

async function sendEmail({

  to,

  subject,

  html,

  text

}) {

  const recipient =
    String(to || '').trim();


  if (!recipient) {

    throw new Error(
      'Email recipient is empty.'
    );

  }


  if (!SMTP_USER) {

    throw new Error(
      'SMTP_USER is missing.'
    );

  }


  if (!SMTP_PASS) {

    throw new Error(
      'SMTP_PASS is missing.'
    );

  }


  console.log(
    '------------------------------------------'
  );

  console.log(
    'Preparing email...'
  );

  console.log(
    `From: ${FROM_EMAIL}`
  );

  console.log(
    `To: ${recipient}`
  );

  console.log(
    `Subject: ${subject}`
  );


  const transporter =
    createTransporter();


  try {

    console.log(
      'Verifying SMTP connection before sending...'
    );

    await transporter.verify();

    console.log(
      'SMTP connection verified.'
    );


    console.log(
      `Calling sendMail() for ${recipient}...`
    );


    const info =
      await transporter.sendMail({

        from: {

          name:
            'Utsav Socio-Cultural Trust',

          address:
            FROM_EMAIL

        },

        to:
          recipient,

        subject:
          subject,

        text:
          text || '',

        html:
          html || text || ''

      });


    console.log(
      '=========================================='
    );

    console.log(
      'EMAIL SENT SUCCESSFULLY'
    );

    console.log(
      `To: ${recipient}`
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
      `Response: ${info.response}`
    );

    console.log(
      '=========================================='
    );


    return info;


  } catch (error) {

    console.error(
      '=========================================='
    );

    console.error(
      'EMAIL SEND FAILED'
    );

    console.error(
      `Recipient: ${recipient}`
    );

    console.error(
      `Subject: ${subject}`
    );

    console.error(
      'Error code:',
      error.code
    );

    console.error(
      'Error command:',
      error.command
    );

    console.error(
      'Error response code:',
      error.responseCode
    );

    console.error(
      'Error response:',
      error.response
    );

    console.error(
      'Error message:',
      error.message
    );

    console.error(
      'Full error:',
      error
    );

    console.error(
      '=========================================='
    );


    throw error;
  }
}


// ============================================================
// SELLER EMAIL
// ============================================================

async function sendOrderEmail(booking) {

  console.log(
    '=========================================='
  );

  console.log(
    'Attempting to send SELLER email...'
  );

  console.log(
    `Seller recipient: ${SELLER_EMAIL}`
  );


  if (!SELLER_EMAIL) {

    throw new Error(
      'SELLER_EMAIL is not configured.'
    );

  }


  const orderRows =
    (booking.dayOrders || [])
      .map(order => {

        return `

          <tr>

            <td style="padding:8px;border:1px solid #ddd;">
              ${escapeHtml(order.day)}
            </td>

            <td style="padding:8px;border:1px solid #ddd;">
              ${escapeHtml(order.lunchType || booking.lunchType || '')}
            </td>

            <td style="padding:8px;border:1px solid #ddd;">
              ${escapeHtml(String(order.qty || ''))}
            </td>

            <td style="padding:8px;border:1px solid #ddd;">
              ₹${escapeHtml(String(order.amount || ''))}
            </td>

            <td style="padding:8px;border:1px solid #ddd;">
              ${escapeHtml(order.orderId || '')}
            </td>

          </tr>

        `;

      })
      .join('');


  const subject =
    `PAYMENT CONFIRMED – ${booking.bookingId}`;


  const text = `

UTSAV Bhog Booking - PAYMENT CONFIRMED

Booking ID:
${booking.bookingId}

Customer:
${booking.name}

Phone:
${booking.phone}

Email:
${booking.email}

Lunch Type:
${booking.lunchType}

Total Amount:
₹${booking.totalAmount}

PayU Transaction ID:
${booking.payuTxnId}

PayU Payment ID:
${booking.payuPaymentId || 'N/A'}

Paid At:
${booking.paidAt}

Orders:

${(booking.dayOrders || [])
  .map(order =>
    `${order.day} - ${order.qty} plates - ₹${order.amount} - Order ID: ${order.orderId}`
  )
  .join('\n')}

`;


  const html = `

<!DOCTYPE html>

<html>

<head>

<meta charset="UTF-8">

<title>Payment Confirmed</title>

</head>

<body style="font-family:Arial,sans-serif;color:#2A1B14;">

<h2>
UTSAV Bhog Booking - Payment Confirmed
</h2>

<p>
A customer payment has been successfully confirmed.
</p>

<table style="border-collapse:collapse;">

<tr>
<td style="padding:6px;font-weight:bold;">Booking ID</td>
<td style="padding:6px;">${escapeHtml(booking.bookingId)}</td>
</tr>

<tr>
<td style="padding:6px;font-weight:bold;">Customer</td>
<td style="padding:6px;">${escapeHtml(booking.name)}</td>
</tr>

<tr>
<td style="padding:6px;font-weight:bold;">Phone</td>
<td style="padding:6px;">${escapeHtml(booking.phone)}</td>
</tr>

<tr>
<td style="padding:6px;font-weight:bold;">Email</td>
<td style="padding:6px;">${escapeHtml(booking.email)}</td>
</tr>

<tr>
<td style="padding:6px;font-weight:bold;">Lunch Type</td>
<td style="padding:6px;">${escapeHtml(booking.lunchType)}</td>
</tr>

<tr>
<td style="padding:6px;font-weight:bold;">Total Amount</td>
<td style="padding:6px;">₹${escapeHtml(String(booking.totalAmount))}</td>
</tr>

<tr>
<td style="padding:6px;font-weight:bold;">PayU Transaction ID</td>
<td style="padding:6px;">${escapeHtml(booking.payuTxnId)}</td>
</tr>

<tr>
<td style="padding:6px;font-weight:bold;">PayU Payment ID</td>
<td style="padding:6px;">${escapeHtml(booking.payuPaymentId || 'N/A')}</td>
</tr>

</table>

<br>

<h3>Orders</h3>

<table
  style="
    border-collapse:collapse;
    width:100%;
    max-width:900px;
  "
>

<thead>

<tr>

<th style="padding:8px;border:1px solid #ddd;">
Day
</th>

<th style="padding:8px;border:1px solid #ddd;">
Lunch Type
</th>

<th style="padding:8px;border:1px solid #ddd;">
Quantity
</th>

<th style="padding:8px;border:1px solid #ddd;">
Amount
</th>

<th style="padding:8px;border:1px solid #ddd;">
Order ID
</th>

</tr>

</thead>

<tbody>

${orderRows}

</tbody>

</table>

</body>

</html>

`;


  return sendEmail({

    to:
      SELLER_EMAIL,

    subject,

    text,

    html

  });

}


// ============================================================
// CUSTOMER RECEIPT EMAIL
// ============================================================

async function sendCustomerReceiptEmail(

  booking,

  attachment = null

) {

  console.log(
    '=========================================='
  );

  console.log(
    'Attempting to send CUSTOMER receipt email...'
  );


  const customerEmail =
    String(
      booking.email || ''
    ).trim();


  console.log(
    `Customer recipient: ${customerEmail}`
  );


  if (!customerEmail) {

    throw new Error(
      'Customer email is missing from booking.'
    );

  }


  const orderRows =
    (booking.dayOrders || [])
      .map(order => {

        return `

          <tr>

            <td style="padding:8px;border:1px solid #ddd;">
              ${escapeHtml(order.day)}
            </td>

            <td style="padding:8px;border:1px solid #ddd;">
              ${escapeHtml(String(order.qty || ''))}
            </td>

            <td style="padding:8px;border:1px solid #ddd;">
              ₹${escapeHtml(String(order.amount || ''))}
            </td>

            <td style="padding:8px;border:1px solid #ddd;">
              ${escapeHtml(order.orderId || '')}
            </td>

          </tr>

        `;

      })
      .join('');


  const subject =
    `UTSAV Bhog Booking Confirmed – ${booking.bookingId}`;


  const text = `

Dear ${booking.name},

Your UTSAV Bhog booking payment has been successfully confirmed.

Booking ID:
${booking.bookingId}

Total Amount:
₹${booking.totalAmount}

PayU Transaction ID:
${booking.payuTxnId}

PayU Payment ID:
${booking.payuPaymentId || 'N/A'}

Paid At:
${booking.paidAt}

Orders:

${(booking.dayOrders || [])
  .map(order =>
    `${order.day} - ${order.qty} plates - ₹${order.amount} - Order ID: ${order.orderId}`
  )
  .join('\n')}

Thank you for booking with Utsav Socio-Cultural Trust.

`;


  const html = `

<!DOCTYPE html>

<html>

<head>

<meta charset="UTF-8">

<title>UTSAV Bhog Booking Confirmed</title>

</head>

<body style="font-family:Arial,sans-serif;color:#2A1B14;">

<h2>
UTSAV Bhog Booking Confirmed
</h2>

<p>
Dear ${escapeHtml(booking.name)},
</p>

<p>
Your payment has been successfully confirmed.
</p>

<table style="border-collapse:collapse;">

<tr>

<td style="padding:6px;font-weight:bold;">
Booking ID
</td>

<td style="padding:6px;">
${escapeHtml(booking.bookingId)}
</td>

</tr>

<tr>

<td style="padding:6px;font-weight:bold;">
Total Amount
</td>

<td style="padding:6px;">
₹${escapeHtml(String(booking.totalAmount))}
</td>

</tr>

<tr>

<td style="padding:6px;font-weight:bold;">
PayU Transaction ID
</td>

<td style="padding:6px;">
${escapeHtml(booking.payuTxnId)}
</td>

</tr>

<tr>

<td style="padding:6px;font-weight:bold;">
PayU Payment ID
</td>

<td style="padding:6px;">
${escapeHtml(booking.payuPaymentId || 'N/A')}
</td>

</tr>

</table>

<br>

<h3>Your Orders</h3>

<table
  style="
    border-collapse:collapse;
    width:100%;
    max-width:700px;
  "
>

<thead>

<tr>

<th style="padding:8px;border:1px solid #ddd;">
Day
</th>

<th style="padding:8px;border:1px solid #ddd;">
Quantity
</th>

<th style="padding:8px;border:1px solid #ddd;">
Amount
</th>

<th style="padding:8px;border:1px solid #ddd;">
Order ID
</th>

</tr>

</thead>

<tbody>

${orderRows}

</tbody>

</table>

<br>

<p>
Thank you for booking with Utsav Socio-Cultural Trust.
</p>

</body>

</html>

`;


  const mailOptions = {

    to:
      customerEmail,

    subject,

    text,

    html

  };


  if (attachment) {

    mailOptions.attachments =
      [attachment];

  }


  return sendEmail(mailOptions);

}


// ============================================================
// TEST EMAIL
// ============================================================

async function testEmail(
  recipient
) {

  const to =
    String(
      recipient || SELLER_EMAIL
    ).trim();


  return sendEmail({

    to,

    subject:
      'UTSAV Bhog Booking - SMTP Test',

    text:
      'This is a test email from the UTSAV Bhog Booking backend.',

    html: `

      <h2>
        UTSAV Bhog Booking SMTP Test
      </h2>

      <p>
        If you received this email, SMTP is working correctly.
      </p>

    `

  });

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
// EXPORTS
// ============================================================

module.exports = {

  sendOrderEmail,

  sendCustomerReceiptEmail,

  testEmail,

  verifySMTP

};
