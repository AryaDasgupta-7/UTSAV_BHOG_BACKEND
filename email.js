const nodemailer = require('nodemailer');


// ============================================================
// EMAIL TRANSPORT
// ============================================================

function getTransport() {

  const {
    SMTP_HOST,
    SMTP_PORT,
    SMTP_USER,
    SMTP_PASS
  } = process.env;


  if (
    !SMTP_HOST ||
    !SMTP_USER ||
    !SMTP_PASS
  ) {

    console.error(
      'EMAIL ERROR: SMTP_HOST, SMTP_USER or SMTP_PASS is missing.'
    );

    return null;

  }


  const port =
    Number(SMTP_PORT) || 465;


  const secure =
    port === 465;


  console.log(
    'Creating SMTP transport:',
    {
      host: SMTP_HOST,
      port,
      secure,
      user: SMTP_USER
    }
  );


  return nodemailer.createTransport({

    host: SMTP_HOST,

    port,

    secure,

    auth: {

      user: SMTP_USER,

      pass: SMTP_PASS

    }

  });

}


// ============================================================
// SELLER PAYMENT CONFIRMATION
// ============================================================

async function sendOrderEmail(
  booking
) {

  const transport =
    getTransport();


  const sellerEmail =
    process.env.SELLER_EMAIL;


  if (!transport) {

    throw new Error(
      'SMTP transport is not configured.'
    );

  }


  if (!sellerEmail) {

    throw new Error(
      'SELLER_EMAIL is not configured.'
    );

  }


  const dayText =
    booking.dayOrders
      .map(
        order =>
          `- ${order.day}: ${order.qty} plate(s) — ₹${order.amount}`
      )
      .join('\n');


  // Verify SMTP connection before sending

  await transport.verify();


  const info =
    await transport.sendMail({

      from:
        process.env.FROM_EMAIL ||
        process.env.SMTP_USER,

      to:
        sellerEmail,

      subject:
        `PAYMENT CONFIRMED — ${booking.finalOrderId || booking.bookingId}`,

      text:

`UTSAV SOCIO-CULTURAL TRUST
BHOG BOOKING — PAYMENT CONFIRMED

Booking ID:
${booking.bookingId}

Special UTSAV Order ID(s):
${booking.dayOrders
  .map(order => `${order.day}: ${order.orderId}`)
  .join('\n')}

Name:
${booking.name}

Phone:
${booking.phone}

Email:
${booking.email}

Lunch Type:
${booking.lunchType}

Days:
${dayText}

Total Paid:
Rs. ${booking.totalAmount}

PayU Payment ID:
${booking.payuPaymentId || 'Not provided'}

PayU Transaction ID:
${booking.payuTxnId || 'Not provided'}

Paid At:
${booking.paidAt}

The payment has been successfully verified by the UTSAV server.

Please open the seller dashboard for the complete booking details.`

    });


  console.log(
    'SELLER EMAIL SENT:',
    info.messageId
  );


  return info;

}


// ============================================================
// CUSTOMER RECEIPT
// ============================================================

async function sendCustomerReceiptEmail(
  booking
) {

  const transport =
    getTransport();


  if (!transport) {

    throw new Error(
      'SMTP transport is not configured.'
    );

  }


  if (!booking.email) {

    throw new Error(
      'Customer email address is missing.'
    );

  }


  const dayText =
    booking.dayOrders
      .map(
        order =>
          `- ${order.day}: ${order.qty} plate(s) — ₹${order.amount}`
      )
      .join('\n');


  // Verify SMTP connection before sending

  await transport.verify();


  const info =
    await transport.sendMail({

      from:
        process.env.FROM_EMAIL ||
        process.env.SMTP_USER,

      to:
        booking.email,

      subject:
        `UTSAV Bhog Booking Confirmed — ${booking.bookingId}`,

      text:

`Dear ${booking.name},

Thank you for booking Bhog with Utsav Socio-Cultural Trust.

Your payment has been successfully verified.

BOOKING ID:
${booking.bookingId}

SPECIAL UTSAV ORDER ID(s):
${booking.dayOrders
  .map(order => `${order.day}: ${order.orderId}`)
  .join('\n')}

Booking details:

${dayText}

Lunch Type:
${booking.lunchType}

Total Paid:
Rs. ${booking.totalAmount}

PayU Payment ID:
${booking.payuPaymentId || 'Not provided'}

PayU Transaction ID:
${booking.payuTxnId || 'Not provided'}

Paid At:
${booking.paidAt}

Please keep your UTSAV Order ID safely.

Thank you,

Utsav Socio-Cultural Trust`

    });


  console.log(
    'CUSTOMER EMAIL SENT:',
    info.messageId
  );


  return info;

}


// ============================================================
// EXPORT
// ============================================================

module.exports = {

  sendOrderEmail,

  sendCustomerReceiptEmail

};
