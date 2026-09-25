const nodemailer = require('nodemailer');


// ============================================================
// EMAIL CONFIGURATION
// ============================================================

const SMTP_HOST =
  String(process.env.SMTP_HOST || '').trim();

const SMTP_PORT =
  Number(process.env.SMTP_PORT || 465);

const SMTP_USER =
  String(process.env.SMTP_USER || '').trim();

const SMTP_PASS =
  String(process.env.SMTP_PASS || '').trim();

const SELLER_EMAIL =
  String(process.env.SELLER_EMAIL || '').trim();

const FROM_EMAIL =
  String(
    process.env.FROM_EMAIL ||
    SMTP_USER
  ).trim();


// ============================================================
// CREATE SMTP TRANSPORT
// ============================================================

function getTransport() {

  if (!SMTP_HOST) {

    throw new Error(
      'SMTP_HOST is missing from environment variables.'
    );

  }

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


  return nodemailer.createTransport({

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

}


// ============================================================
// VERIFY SMTP CONNECTION
// ============================================================

async function verifyEmailConfiguration() {

  const transport =
    getTransport();

  console.log(
    'Verifying SMTP connection...'
  );

  await transport.verify();

  console.log(
    'SMTP connection verified successfully.'
  );

  return true;
}


// ============================================================
// SEND SELLER EMAIL
// ============================================================

async function sendOrderEmail(
  booking
) {

  if (!booking) {

    throw new Error(
      'Booking data is missing for seller email.'
    );

  }


  if (!SELLER_EMAIL) {

    throw new Error(
      'SELLER_EMAIL is missing from environment variables.'
    );

  }


  const transport =
    getTransport();


  const orders =
    Array.isArray(
      booking.dayOrders
    )
      ? booking.dayOrders
      : [];


  const orderList =
    orders
      .map(
        order =>
          `${order.day} - ${order.qty} plate(s) - ₹${order.amount} - Order ID: ${order.orderId || 'N/A'}`
      )
      .join('\n');


  console.log(
    'Attempting to send SELLER email...'
  );

  console.log(
    `Seller recipient: ${SELLER_EMAIL}`
  );


  const info =
    await transport.sendMail({

      from:
        FROM_EMAIL,

      to:
        SELLER_EMAIL,

      replyTo:
        booking.email || SMTP_USER,

      subject:
        `PAYMENT CONFIRMED - ${booking.bookingId}`,

      text:
`UTSAV Bhog Booking - PAYMENT CONFIRMED

Booking ID: ${booking.bookingId}

Customer Name: ${booking.name}

Customer Phone: ${booking.phone}

Customer Email: ${booking.email}

Lunch Type: ${booking.lunchType}

Total Amount: ₹${booking.totalAmount}

PayU Transaction ID: ${booking.payuTxnId || 'N/A'}

PayU Payment ID: ${booking.payuPaymentId || 'N/A'}

Paid At: ${booking.paidAt || 'N/A'}


ORDER DETAILS

${orderList}


Payment Status: PAID
`,

      html:
`
<!DOCTYPE html>

<html>

<head>

<meta charset="UTF-8">

<title>UTSAV Bhog Payment Confirmed</title>

</head>

<body
  style="
    margin:0;
    padding:0;
    background:#f7f1e8;
    font-family:Arial,sans-serif;
    color:#2a1b14;
  "
>

<div
  style="
    max-width:700px;
    margin:30px auto;
    background:#ffffff;
    border-radius:12px;
    padding:30px;
  "
>

<h2
  style="
    margin-top:0;
    color:#8f2633;
  "
>
UTSAV Bhog Booking - Payment Confirmed
</h2>

<p>
A customer has successfully completed payment.
</p>

<hr>

<p>
<strong>Booking ID:</strong>
${booking.bookingId}
</p>

<p>
<strong>Customer Name:</strong>
${booking.name}
</p>

<p>
<strong>Customer Phone:</strong>
${booking.phone}
</p>

<p>
<strong>Customer Email:</strong>
${booking.email}
</p>

<p>
<strong>Lunch Type:</strong>
${booking.lunchType}
</p>

<p>
<strong>Total Amount:</strong>
₹${booking.totalAmount}
</p>

<p>
<strong>PayU Transaction ID:</strong>
${booking.payuTxnId || 'N/A'}
</p>

<p>
<strong>PayU Payment ID:</strong>
${booking.payuPaymentId || 'N/A'}
</p>

<p>
<strong>Paid At:</strong>
${booking.paidAt || 'N/A'}
</p>

<hr>

<h3>
Order Details
</h3>

${orders.map(
  order => `
    <div
      style="
        padding:12px;
        margin-bottom:10px;
        background:#f8f4ee;
        border-radius:8px;
      "
    >

      <strong>
        ${order.day}
      </strong>

      <br>

      Plates:
      ${order.qty}

      <br>

      Amount:
      ₹${order.amount}

      <br>

      Order ID:
      ${order.orderId || 'N/A'}

    </div>
  `
).join('')}

<hr>

<p
  style="
    font-weight:bold;
    color:#1f4b3f;
  "
>
Payment Status: PAID
</p>

</div>

</body>

</html>
`

    });


  console.log(
    'SELLER EMAIL ACCEPTED BY SMTP SERVER'
  );

  console.log(
    `Seller email message ID: ${info.messageId}`
  );

  console.log(
    `Seller email response: ${info.response}`
  );


  return {

    success:
      true,

    messageId:
      info.messageId,

    response:
      info.response,

    recipient:
      SELLER_EMAIL

  };

}


// ============================================================
// SEND CUSTOMER RECEIPT EMAIL
// ============================================================

async function sendCustomerReceiptEmail(
  booking,
  paymentLink = null
) {

  if (!booking) {

    throw new Error(
      'Booking data is missing for customer receipt email.'
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


  const transport =
    getTransport();


  const orders =
    Array.isArray(
      booking.dayOrders
    )
      ? booking.dayOrders
      : [];


  const orderList =
    orders
      .map(
        order =>
          `${order.day} - ${order.qty} plate(s) - ₹${order.amount} - Order ID: ${order.orderId || 'N/A'}`
      )
      .join('\n');


  console.log(
    'Attempting to send CUSTOMER receipt email...'
  );

  console.log(
    `Customer recipient: ${customerEmail}`
  );


  const info =
    await transport.sendMail({

      from:
        FROM_EMAIL,

      to:
        customerEmail,

      replyTo:
        SELLER_EMAIL || SMTP_USER,

      subject:
        `UTSAV Bhog Booking Confirmed - ${booking.bookingId}`,

      text:
`UTSAV Bhog Booking Confirmed

Dear ${booking.name},

Your payment has been successfully received.

Booking ID: ${booking.bookingId}

Total Amount: ₹${booking.totalAmount}

Lunch Type: ${booking.lunchType}

PayU Transaction ID: ${booking.payuTxnId || 'N/A'}

PayU Payment ID: ${booking.payuPaymentId || 'N/A'}

Paid At: ${booking.paidAt || 'N/A'}


YOUR ORDER DETAILS

${orderList}


Payment Status: PAID

Thank you for booking UTSAV Bhog.

Please keep this email for your records.
`,

      html:
`
<!DOCTYPE html>

<html>

<head>

<meta charset="UTF-8">

<title>UTSAV Bhog Booking Confirmed</title>

</head>

<body
  style="
    margin:0;
    padding:0;
    background:#f7f1e8;
    font-family:Arial,sans-serif;
    color:#2a1b14;
  "
>

<div
  style="
    max-width:700px;
    margin:30px auto;
    background:#ffffff;
    border-radius:12px;
    padding:30px;
  "
>

<h2
  style="
    margin-top:0;
    color:#8f2633;
  "
>
UTSAV Bhog Booking Confirmed
</h2>

<p>
Dear ${booking.name},
</p>

<p>
Your payment has been successfully received.
</p>

<div
  style="
    background:#f8f4ee;
    border-radius:10px;
    padding:18px;
    margin:20px 0;
  "
>

<p>
<strong>Booking ID:</strong>
${booking.bookingId}
</p>

<p>
<strong>Total Amount:</strong>
₹${booking.totalAmount}
</p>

<p>
<strong>Lunch Type:</strong>
${booking.lunchType}
</p>

<p>
<strong>PayU Transaction ID:</strong>
${booking.payuTxnId || 'N/A'}
</p>

<p>
<strong>PayU Payment ID:</strong>
${booking.payuPaymentId || 'N/A'}
</p>

<p>
<strong>Paid At:</strong>
${booking.paidAt || 'N/A'}
</p>

</div>

<h3>
Your Order Details
</h3>

${orders.map(
  order => `
    <div
      style="
        padding:12px;
        margin-bottom:10px;
        background:#f8f4ee;
        border-radius:8px;
      "
    >

      <strong>
        ${order.day}
      </strong>

      <br>

      Plates:
      ${order.qty}

      <br>

      Amount:
      ₹${order.amount}

      <br>

      Order ID:
      ${order.orderId || 'N/A'}

    </div>
  `
).join('')}

<div
  style="
    margin-top:20px;
    padding:15px;
    background:#eaf4ee;
    border-radius:8px;
    color:#1f4b3f;
  "
>

<strong>
Payment Status: PAID
</strong>

</div>

<p
  style="
    margin-top:25px;
  "
>
Thank you for booking UTSAV Bhog.
</p>

<p>
Please keep this email for your records.
</p>

</div>

</body>

</html>
`

    });


  console.log(
    'CUSTOMER RECEIPT EMAIL ACCEPTED BY SMTP SERVER'
  );

  console.log(
    `Customer email message ID: ${info.messageId}`
  );

  console.log(
    `Customer email response: ${info.response}`
  );


  return {

    success:
      true,

    messageId:
      info.messageId,

    response:
      info.response,

    recipient:
      customerEmail

  };

}


// ============================================================
// EXPORTS
// ============================================================

module.exports = {

  sendOrderEmail,

  sendCustomerReceiptEmail,

  verifyEmailConfiguration

};
