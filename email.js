const nodemailer = require('nodemailer');


// ============================================================
// EMAIL CONFIGURATION
// ============================================================

const SMTP_HOST =
  process.env.SMTP_HOST || 'smtp.gmail.com';

const SMTP_PORT =
  Number(process.env.SMTP_PORT) || 587;

const SMTP_USER =
  process.env.SMTP_USER;

const SMTP_PASS =
  (process.env.SMTP_PASS || '').replace(/\s+/g, '');

const FROM_EMAIL =
  process.env.FROM_EMAIL ||
  SMTP_USER;

const FROM_NAME =
  process.env.FROM_NAME ||
  'Utsav Socio-Cultural Trust';

const SELLER_EMAIL =
  process.env.SELLER_EMAIL;


// ============================================================
// CREATE EMAIL TRANSPORT
// ============================================================

function getTransport() {

  if (!SMTP_USER) {

    console.error(
      'EMAIL ERROR: SMTP_USER is missing.'
    );

    return null;

  }


  if (!SMTP_PASS) {

    console.error(
      'EMAIL ERROR: SMTP_PASS is missing.'
    );

    return null;

  }


  console.log(
    'Creating Gmail SMTP transport...'
  );

  console.log(
    'SMTP host:',
    SMTP_HOST
  );

  console.log(
    'SMTP port:',
    SMTP_PORT
  );

  console.log(
    'SMTP user:',
    SMTP_USER
  );


  /*
   * Gmail:
   *
   * Port 587
   * secure: false
   *
   * Nodemailer will use STARTTLS.
   */

  const transport =
    nodemailer.createTransport({

      host:
        SMTP_HOST,

      port:
        SMTP_PORT,

      secure:
        false,

      requireTLS:
        true,

      auth: {

        user:
          SMTP_USER,

        pass:
          SMTP_PASS

      },

      /*
       * Prevent Render from waiting forever
       * if Gmail SMTP cannot be reached.
       */

      connectionTimeout:
        15000,

      greetingTimeout:
        15000,

      socketTimeout:
        20000

    });


  return transport;

}


// ============================================================
// FROM ADDRESS
// ============================================================

function getFromAddress() {

  return {

    name:
      FROM_NAME,

    address:
      FROM_EMAIL

  };

}


// ============================================================
// VERIFY SMTP CONNECTION
// ============================================================

async function verifyEmailConnection() {

  const transport =
    getTransport();


  if (!transport) {

    throw new Error(
      'SMTP transport could not be created.'
    );

  }


  console.log(
    'Checking Gmail SMTP connection...'
  );


  try {

    await transport.verify();

    console.log(
      'GMAIL SMTP CONNECTION SUCCESSFUL.'
    );


    return true;

  } catch (error) {

    console.error(
      'GMAIL SMTP CONNECTION FAILED.'
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


    throw error;

  }

}


// ============================================================
// COMMON SEND FUNCTION
// ============================================================

async function sendEmail({

  to,

  subject,

  text

}) {

  if (!to) {

    throw new Error(
      'Recipient email address is missing.'
    );

  }


  const transport =
    getTransport();


  if (!transport) {

    throw new Error(
      'SMTP transport is not configured.'
    );

  }


  console.log(
    '--------------------------------------------------'
  );

  console.log(
    'Attempting to send email...'
  );

  console.log(
    'From:',
    FROM_EMAIL
  );

  console.log(
    'To:',
    to
  );

  console.log(
    'Subject:',
    subject
  );


  try {

    const info =
      await transport.sendMail({

        from:
          getFromAddress(),

        to:
          to,

        subject:
          subject,

        text:
          text

      });


    console.log(
      '--------------------------------------------------'
    );

    console.log(
      'EMAIL SENT SUCCESSFULLY'
    );

    console.log(
      'Message ID:',
      info.messageId
    );

    console.log(
      'Accepted:',
      info.accepted
    );

    console.log(
      'Rejected:',
      info.rejected
    );

    console.log(
      'Response:',
      info.response
    );

    console.log(
      '--------------------------------------------------'
    );


    /*
     * Close the SMTP connection.
     */

    transport.close();


    return info;

  } catch (error) {

    console.error(
      '--------------------------------------------------'
    );

    console.error(
      'EMAIL SEND FAILED'
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
      'Error responseCode:',
      error.responseCode
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
      '--------------------------------------------------'
    );


    transport.close();


    throw error;

  }

}


// ============================================================
// SELLER PAYMENT CONFIRMATION
// ============================================================

async function sendOrderEmail(
  booking
) {

  if (!SELLER_EMAIL) {

    throw new Error(
      'SELLER_EMAIL is not configured.'
    );

  }


  if (!booking) {

    throw new Error(
      'Booking data is missing.'
    );

  }


  const dayText =
    (booking.dayOrders || [])
      .map(
        order =>
          `- ${order.day}: ${order.qty} plate(s) — ₹${order.amount}`
      )
      .join('\n');


  const specialOrderIds =
    (booking.dayOrders || [])
      .map(
        order =>
          `${order.day}: ${order.orderId || 'Not generated'}`
      )
      .join('\n');


  const subject =
    `PAYMENT CONFIRMED — ${
      booking.finalOrderId ||
      booking.bookingId ||
      'UTSAV BOOKING'
    }`;


  const text =

`UTSAV SOCIO-CULTURAL TRUST
BHOG BOOKING — PAYMENT CONFIRMED

Booking ID:
${booking.bookingId || 'Not provided'}

Special UTSAV Order ID(s):
${specialOrderIds || 'Not provided'}

Name:
${booking.name || 'Not provided'}

Phone:
${booking.phone || 'Not provided'}

Email:
${booking.email || 'Not provided'}

Lunch Type:
${booking.lunchType || 'Not provided'}

Days:
${dayText || 'Not provided'}

Total Paid:
Rs. ${booking.totalAmount || 0}

PayU Payment ID:
${booking.payuPaymentId || 'Not provided'}

PayU Transaction ID:
${booking.payuTxnId || 'Not provided'}

Paid At:
${booking.paidAt || new Date().toISOString()}

The payment has been successfully verified by the UTSAV server.

Please open the seller dashboard for the complete booking details.
`;


  console.log(
    'Sending seller payment confirmation...'
  );


  return await sendEmail({

    to:
      SELLER_EMAIL,

    subject:
      subject,

    text:
      text

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
      'Booking data is missing.'
    );

  }


  if (!booking.email) {

    throw new Error(
      'Customer email address is missing.'
    );

  }


  const dayText =
    (booking.dayOrders || [])
      .map(
        order =>
          `- ${order.day}: ${order.qty} plate(s) — ₹${order.amount}`
      )
      .join('\n');


  const specialOrderIds =
    (booking.dayOrders || [])
      .map(
        order =>
          `${order.day}: ${order.orderId || 'Not generated'}`
      )
      .join('\n');


  const subject =
    `UTSAV Bhog Booking Confirmed — ${
      booking.bookingId ||
      booking.finalOrderId ||
      'UTSAV BOOKING'
    }`;


  const text =

`Dear ${booking.name || 'Customer'},

Thank you for booking Bhog with Utsav Socio-Cultural Trust.

Your payment has been successfully verified.

BOOKING ID:
${booking.bookingId || 'Not provided'}

SPECIAL UTSAV ORDER ID(s):
${specialOrderIds || 'Not provided'}

Booking details:

${dayText || 'Not provided'}

Lunch Type:
${booking.lunchType || 'Not provided'}

Total Paid:
Rs. ${booking.totalAmount || 0}

PayU Payment ID:
${booking.payuPaymentId || 'Not provided'}

PayU Transaction ID:
${booking.payuTxnId || 'Not provided'}

Paid At:
${booking.paidAt || new Date().toISOString()}

Please keep your UTSAV Order ID safely.

Thank you,

Utsav Socio-Cultural Trust
`;


  console.log(
    'Sending customer receipt...'
  );


  return await sendEmail({

    to:
      booking.email,

    subject:
      subject,

    text:
      text

  });

}


// ============================================================
// SEND BOTH EMAILS
// ============================================================

async function sendBothBookingEmails(
  booking
) {

  console.log(
    '=================================================='
  );

  console.log(
    'STARTING UTSAV EMAIL DELIVERY'
  );

  console.log(
    'Booking:',
    booking.bookingId
  );

  console.log(
    'Customer:',
    booking.email
  );

  console.log(
    'Seller:',
    SELLER_EMAIL
  );

  console.log(
    '=================================================='
  );


  const results =
    await Promise.allSettled([

      sendOrderEmail(
        booking
      ),

      sendCustomerReceiptEmail(
        booking
      )

    ]);


  const sellerResult =
    results[0];

  const customerResult =
    results[1];


  if(
    sellerResult.status === 'fulfilled'
  ) {

    console.log(
      'SELLER EMAIL: SUCCESS'
    );

  } else {

    console.error(
      'SELLER EMAIL: FAILED',
      sellerResult.reason
    );

  }


  if(
    customerResult.status === 'fulfilled'
  ) {

    console.log(
      'CUSTOMER EMAIL: SUCCESS'
    );

  } else {

    console.error(
      'CUSTOMER EMAIL: FAILED',
      customerResult.reason
    );

  }


  console.log(
    '=================================================='
  );


  return {

    seller:

      sellerResult.status === 'fulfilled',

    customer:

      customerResult.status === 'fulfilled'

  };

}


// ============================================================
// EXPORT
// ============================================================

module.exports = {

  sendOrderEmail,

  sendCustomerReceiptEmail,

  sendBothBookingEmails,

  verifyEmailConnection

};
