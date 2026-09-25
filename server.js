const nodemailer = require('nodemailer');

/*
|--------------------------------------------------------------------------
| EMAIL CONFIGURATION
|--------------------------------------------------------------------------
*/

function getTransport() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    console.error('==================================================');
    console.error('EMAIL CONFIGURATION ERROR');
    console.error('Missing SMTP environment variables.');
    console.error('Required: SMTP_HOST, SMTP_USER, SMTP_PASS');
    console.error('==================================================');

    return null;
  }

  const port = Number(process.env.SMTP_PORT) || 465;

  /*
   * SMTP_SECURE can be explicitly set to true/false.
   * If not provided:
   * 465 -> secure
   * other ports -> not secure
   */
  const secure =
    process.env.SMTP_SECURE !== undefined
      ? String(process.env.SMTP_SECURE).toLowerCase() === 'true'
      : port === 465;

  return nodemailer.createTransport({
    host,
    port,
    secure,

    auth: {
      user,
      pass
    },

    /*
     * Helpful for Render/cloud hosting.
     */
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000
  });
}


/*
|--------------------------------------------------------------------------
| VERIFY EMAIL CONFIGURATION
|--------------------------------------------------------------------------
|
| This is useful because Render logs will tell us immediately if SMTP
| credentials are wrong.
|
*/

async function verifyEmailTransport() {
  const transport = getTransport();

  if (!transport) {
    console.error('Email transport could not be created.');
    return false;
  }

  try {
    await transport.verify();

    console.log('==================================================');
    console.log('EMAIL SMTP CONNECTION SUCCESSFUL');
    console.log(`SMTP Host: ${process.env.SMTP_HOST}`);
    console.log(`SMTP Port: ${process.env.SMTP_PORT || 465}`);
    console.log('==================================================');

    return true;

  } catch (error) {

    console.error('==================================================');
    console.error('EMAIL SMTP CONNECTION FAILED');
    console.error('==================================================');

    console.error('SMTP Error:', error.message);

    if (error.code) {
      console.error('Error Code:', error.code);
    }

    console.error('==================================================');

    return false;
  }
}


/*
|--------------------------------------------------------------------------
| GET ORDER ID TEXT
|--------------------------------------------------------------------------
|
| Your server creates one orderId for every booking day.
|
| Example:
|
| Saptami  -> UTSAV26-SAP-XXXX1234
| Navami   -> UTSAV26-NAV-XXXX5678
|
*/

function getOrderIdText(booking) {

  if (
    !booking ||
    !Array.isArray(booking.dayOrders)
  ) {
    return 'Not available';
  }

  return booking.dayOrders
    .map(order => {
      return `${order.day}: ${order.orderId || 'Not generated'}`;
    })
    .join('\n');
}


/*
|--------------------------------------------------------------------------
| GET DAY DETAILS
|--------------------------------------------------------------------------
*/

function getDayText(booking) {

  if (
    !booking ||
    !Array.isArray(booking.dayOrders)
  ) {
    return 'No booking details available.';
  }

  return booking.dayOrders
    .map(order => {
      return (
        `- ${order.day}: ${order.qty} plate(s) — Rs. ${order.amount}`
      );
    })
    .join('\n');
}


/*
|--------------------------------------------------------------------------
| SELLER PAYMENT CONFIRMATION
|--------------------------------------------------------------------------
*/

async function sendOrderEmail(booking) {

  console.log('==================================================');
  console.log('PREPARING SELLER EMAIL');
  console.log('==================================================');

  const transport = getTransport();

  const sellerEmail =
    process.env.SELLER_EMAIL;

  if (!transport) {

    console.error(
      'Seller email NOT sent because SMTP is not configured.'
    );

    return false;
  }

  if (!sellerEmail) {

    console.error(
      'Seller email NOT sent because SELLER_EMAIL is missing.'
    );

    return false;
  }

  const fromEmail =
    process.env.FROM_EMAIL ||
    process.env.SMTP_USER;

  const orderIdText =
    getOrderIdText(booking);

  const dayText =
    getDayText(booking);

  try {

    const info = await transport.sendMail({

      from: fromEmail,

      to: sellerEmail,

      replyTo: booking.email,

      subject:
        `PAYMENT CONFIRMED — UTSAV Bhog Booking ${booking.bookingId}`,

      text:

`UTSAV SOCIO-CULTURAL TRUST
BHOG BOOKING — PAYMENT CONFIRMED

========================================

BOOKING INFORMATION

Booking ID:
${booking.bookingId}

Order ID(s):
${orderIdText}

========================================

CUSTOMER INFORMATION

Name:
${booking.name}

Phone:
${booking.phone}

Email:
${booking.email}

Lunch Type:
${booking.lunchType}

========================================

BOOKING DETAILS

${dayText}

Total Paid:
Rs. ${booking.totalAmount}

========================================

PAYMENT INFORMATION

PayU Transaction ID:
${booking.payuTxnId || 'Not provided'}

PayU Payment ID:
${booking.payuPaymentId || 'Not provided'}

Payment Status:
${booking.status || 'paid'}

Paid At:
${booking.paidAt || 'Not available'}

========================================

The payment has been successfully verified by the UTSAV server.

Please open the seller dashboard for the complete booking details.

UTSAV Socio-Cultural Trust
`
    });

    console.log('==================================================');
    console.log('SELLER EMAIL SENT SUCCESSFULLY');
    console.log(`To: ${sellerEmail}`);
    console.log(`Message ID: ${info.messageId}`);
    console.log('==================================================');

    return true;

  } catch (error) {

    console.error('==================================================');
    console.error('SELLER EMAIL FAILED');
    console.error('==================================================');

    console.error('Error:', error.message);

    if (error.code) {
      console.error('Error Code:', error.code);
    }

    console.error('==================================================');

    return false;
  }
}


/*
|--------------------------------------------------------------------------
| CUSTOMER RECEIPT EMAIL
|--------------------------------------------------------------------------
*/

async function sendCustomerReceiptEmail(booking) {

  console.log('==================================================');
  console.log('PREPARING CUSTOMER EMAIL');
  console.log('==================================================');

  const transport = getTransport();

  if (!transport) {

    console.error(
      'Customer email NOT sent because SMTP is not configured.'
    );

    return false;
  }

  if (
    !booking ||
    !booking.email
  ) {

    console.error(
      'Customer email NOT sent because customer email is missing.'
    );

    return false;
  }

  const fromEmail =
    process.env.FROM_EMAIL ||
    process.env.SMTP_USER;

  const orderIdText =
    getOrderIdText(booking);

  const dayText =
    getDayText(booking);

  try {

    const info = await transport.sendMail({

      from: fromEmail,

      to: booking.email,

      replyTo: fromEmail,

      subject:
        'UTSAV Bhog Booking Confirmed',

      text:

`Dear ${booking.name},

Thank you for booking Bhog with Utsav Socio-Cultural Trust.

Your payment has been successfully verified.

========================================

YOUR BOOKING

Booking ID:
${booking.bookingId}

UTSAV ORDER ID(s):
${orderIdText}

========================================

BOOKING DETAILS

${dayText}

Lunch Type:
${booking.lunchType}

Total Paid:
Rs. ${booking.totalAmount}

========================================

PAYMENT INFORMATION

PayU Transaction ID:
${booking.payuTxnId || 'Not provided'}

PayU Payment ID:
${booking.payuPaymentId || 'Not provided'}

Paid At:
${booking.paidAt || 'Not available'}

========================================

Please keep your UTSAV Order ID(s) safely for future reference.

Thank you for booking with us.

Regards,

UTSAV Socio-Cultural Trust
`
    });

    console.log('==================================================');
    console.log('CUSTOMER EMAIL SENT SUCCESSFULLY');
    console.log(`To: ${booking.email}`);
    console.log(`Message ID: ${info.messageId}`);
    console.log('==================================================');

    return true;

  } catch (error) {

    console.error('==================================================');
    console.error('CUSTOMER EMAIL FAILED');
    console.error('==================================================');

    console.error('Error:', error.message);

    if (error.code) {
      console.error('Error Code:', error.code);
    }

    console.error('==================================================');

    return false;
  }
}


/*
|--------------------------------------------------------------------------
| EXPORTS
|--------------------------------------------------------------------------
*/

module.exports = {

  sendOrderEmail,

  sendCustomerReceiptEmail,

  verifyEmailTransport

};
