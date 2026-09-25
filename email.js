<pre><code>const nodemailer =
  require('nodemailer');


/*
|--------------------------------------------------------------------------
| EMAIL TRANSPORT
|--------------------------------------------------------------------------
*/

function getTransport() {

  const {

    SMTP_HOST,

    SMTP_USER,

    SMTP_PASS

  } = process.env;


  if (
    !SMTP_HOST ||
    !SMTP_USER ||
    !SMTP_PASS
  ) {

    return null;

  }


  const port =
    Number(
      process.env.SMTP_PORT
    ) || 465;


  return nodemailer
    .createTransport({

      host:
        SMTP_HOST,

      port,

      secure:
        port === 465,

      auth: {

        user:
          SMTP_USER,

        pass:
          SMTP_PASS

      }

    });

}


/*
|--------------------------------------------------------------------------
| SELLER PAYMENT CONFIRMATION
|--------------------------------------------------------------------------
*/

async function sendOrderEmail(
  booking
) {

  const transport =
    getTransport();


  const sellerEmail =
    process.env.SELLER_EMAIL;


  if (
    !transport ||
    !sellerEmail
  ) {

    console.log(
      'Seller email is not configured.'
    );

    return;

  }


  const dayText =
    booking.dayOrders
      .map(
        order =>
          `- ${order.day}: ${order.qty} plate(s) — ₹${order.amount}`
      )
      .join('\n');


  await transport.sendMail({

    from:
      process.env.FROM_EMAIL ||
      process.env.SMTP_USER,

    to:
      sellerEmail,

    subject:
      `PAYMENT CONFIRMED — ${booking.finalOrderId}`,

    text:

`UTSAV SOCIO-CULTURAL TRUST
BHOG BOOKING — PAYMENT CONFIRMED

Special UTSAV Order ID:
${booking.finalOrderId}

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

Paid At:
${booking.paidAt}

The payment has been successfully verified by the UTSAV server.

Please open the seller dashboard for the complete booking details.`

  });

}


/*
|--------------------------------------------------------------------------
| CUSTOMER RECEIPT
|--------------------------------------------------------------------------
*/

async function sendCustomerReceiptEmail(
  booking
) {

  const transport =
    getTransport();


  if (!transport) {

    console.log(
      'Customer email transport is not configured.'
    );

    return;

  }


  const dayText =
    booking.dayOrders
      .map(
        order =>
          `- ${order.day}: ${order.qty} plate(s) — ₹${order.amount}`
      )
      .join('\n');


  await transport.sendMail({

    from:
      process.env.FROM_EMAIL ||
      process.env.SMTP_USER,

    to:
      booking.email,

    subject:
      `UTSAV Bhog Booking Confirmed — ${booking.finalOrderId}`,

    text:

`Dear ${booking.name},

Thank you for booking Bhog with Utsav Socio-Cultural Trust.

Your payment has been successfully verified.

SPECIAL UTSAV ORDER ID:
${booking.finalOrderId}

Booking details:

${dayText}

Lunch Type:
${booking.lunchType}

Total Paid:
Rs. ${booking.totalAmount}

PayU Payment ID:
${booking.payuPaymentId || 'Not provided'}

Paid At:
${booking.paidAt}

Please keep your UTSAV Order ID safely.

Thank you,
Utsav Socio-Cultural Trust`

  });

}


module.exports = {

  sendOrderEmail,

  sendCustomerReceiptEmail

};
</code></pre>
