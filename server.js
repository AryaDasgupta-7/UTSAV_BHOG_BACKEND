require('dotenv').config();

const path = require('path');
const express = require('express');

const {
  connectDB,
  ordersCollection
} = require('./db');

const {
  sendOrderEmail,
  sendCustomerReceiptEmail
} = require('./email');

const payu = require('./payu');


// ============================================================
// CONFIGURATION
// ============================================================

const RATE_PER_PLATE = 500;

const ADMIN_API_KEY =
  process.env.ADMIN_API_KEY || 'change-me';


// ============================================================
// BOOKING DAYS
// ============================================================

const DAY_CODES = {
  'Saptami': 'SAP',
  'Adhik Saptami': 'ADS',
  'Ashtami': 'ASH',
  'Navami': 'NAV'
};

const VALID_DAYS = Object.keys(DAY_CODES);

const VALID_LUNCH_TYPES = [
  'Packing',
  'Community Lunch (Dine-In)'
];


// ============================================================
// EXPRESS APP
// ============================================================

const app = express();

// Render sits behind a proxy.
// This makes req.protocol correctly become https.
app.set('trust proxy', 1);

app.use(express.json());

app.use(
  express.urlencoded({
    extended: true
  })
);

app.use(
  express.static(
    path.join(__dirname, 'public')
  )
);


// ============================================================
// ID GENERATORS
// ============================================================

// Internal booking ID.
// This is created BEFORE payment.
//
// Example:
// BOOK-ABC123-XYZ789
//
// This is NOT the final customer-facing order ID.

function generateBookingId() {

  const timestamp =
    Date.now()
      .toString(36)
      .toUpperCase();

  const random =
    Math.random()
      .toString(36)
      .substring(2, 8)
      .toUpperCase();

  return `BOOK-${timestamp}-${random}`;
}


// Final customer-facing order ID.
//
// IMPORTANT:
// This function is called ONLY after PayU payment
// has been successfully verified.

function generateOrderId(dayCode) {

  const year =
    new Date()
      .getFullYear()
      .toString()
      .slice(-2);

  const random =
    Math.random()
      .toString(36)
      .substring(2, 6)
      .toUpperCase();

  const time =
    Date.now()
      .toString()
      .slice(-4);

  return `UTSAV${year}-${dayCode}-${random}${time}`;
}


// ============================================================
// ADMIN AUTHENTICATION
// ============================================================

function requireAdmin(req, res, next) {

  const key =
    req.header('x-api-key');

  if (
    !key ||
    key !== ADMIN_API_KEY
  ) {

    return res.status(401).json({
      error:
        'Unauthorized. Check your admin API key.'
    });

  }

  next();
}


// ============================================================
// HEALTH CHECK
// ============================================================

app.get('/api/health', (req, res) => {

  res.json({
    ok: true,
    service: 'UTSAV Bhog Booking Backend',
    paymentGateway: 'PayU'
  });

});


// ============================================================
// CREATE BOOKING
// ============================================================
//
// IMPORTANT:
//
// This endpoint DOES NOT create the final order ID.
//
// It creates:
//     bookingId
//
// Then the customer is sent to PayU.
//
// Final order IDs are generated only after
// successful PayU verification.
// ============================================================

app.post('/api/orders', async (req, res) => {

  try {

    console.log(
      'NEW ORDER REQUEST:',
      JSON.stringify(req.body, null, 2)
    );


    const {
      name,
      phone,
      email,
      lunchType,
      days
    } = req.body || {};


    // --------------------------------------------------------
    // NAME
    // --------------------------------------------------------

    if (
      !name ||
      typeof name !== 'string' ||
      !name.trim()
    ) {

      return res.status(400).json({
        error:
          'Name is required.'
      });

    }


    // --------------------------------------------------------
    // PHONE
    // --------------------------------------------------------

    const cleanPhone =
      String(phone || '').trim();

    if (
      !/^[6-9]\d{9}$/.test(
        cleanPhone
      )
    ) {

      return res.status(400).json({
        error:
          'Enter a valid 10-digit Indian mobile number.'
      });

    }


    // --------------------------------------------------------
    // EMAIL
    // --------------------------------------------------------

    const cleanEmail =
      String(email || '').trim();

    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
        cleanEmail
      )
    ) {

      return res.status(400).json({
        error:
          'Enter a valid email address.'
      });

    }


    // --------------------------------------------------------
    // LUNCH TYPE
    // --------------------------------------------------------

    if (
      !VALID_LUNCH_TYPES.includes(
        lunchType
      )
    ) {

      return res.status(400).json({
        error:
          'Please choose a lunch type.'
      });

    }


    // --------------------------------------------------------
    // DAYS
    // --------------------------------------------------------

    if (
      !Array.isArray(days) ||
      days.length === 0
    ) {

      return res.status(400).json({
        error:
          'Please select at least one day.'
      });

    }


    // --------------------------------------------------------
    // VALIDATE EACH DAY
    // --------------------------------------------------------

    const seenDays =
      new Set();

    const cleanDays =
      [];


    for (
      const entry of days
    ) {

      const day =
        entry &&
        entry.day;

      const qtyNum =
        parseInt(
          entry &&
          entry.qty,
          10
        );


      if (
        !VALID_DAYS.includes(day)
      ) {

        return res.status(400).json({
          error:
            `"${day}" is not a valid booking day.`
        });

      }


      if (
        seenDays.has(day)
      ) {

        return res.status(400).json({
          error:
            `"${day}" was selected more than once.`
        });

      }


      if (
        !Number.isInteger(qtyNum) ||
        qtyNum < 1 ||
        qtyNum > 200
      ) {

        return res.status(400).json({
          error:
            `Enter a valid number of plates for ${day} (1-200).`
        });

      }


      seenDays.add(day);


      cleanDays.push({
        day,
        qty: qtyNum
      });

    }


    // --------------------------------------------------------
    // CREATE INTERNAL BOOKING ID
    // --------------------------------------------------------

    const bookingId =
      generateBookingId();


    const createdAt =
      new Date().toISOString();


    const cleanName =
      name.trim();


    // --------------------------------------------------------
    // CREATE PENDING DAY ORDERS
    // --------------------------------------------------------

    const dayOrders =
      cleanDays.map(
        ({
          day,
          qty
        }) => {

          return {

            // IMPORTANT:
            // No final customer order ID yet.
            orderId: null,

            bookingId,

            day,

            lunchType,

            name:
              cleanName,

            phone:
              cleanPhone,

            email:
              cleanEmail,

            qty,

            amount:
              qty * RATE_PER_PLATE,

            status:
              'pending',

            paymentStatus:
              'pending',

            createdAt

          };

        }
      );


    // --------------------------------------------------------
    // TOTAL
    // --------------------------------------------------------

    const totalAmount =
      dayOrders.reduce(
        (
          sum,
          order
        ) =>
          sum +
          order.amount,
        0
      );


    // --------------------------------------------------------
    // SAVE TO MONGODB
    // --------------------------------------------------------

    try {

      await ordersCollection()
        .insertMany(
          dayOrders
        );

    } catch (dbError) {

      console.error(
        'MongoDB order creation error:',
        dbError
      );

      return res.status(500).json({
        error:
          'Could not save your order right now. Please try again.'
      });

    }


    console.log(
      `Pending booking created: ${bookingId} | Amount: ₹${totalAmount}`
    );


    // --------------------------------------------------------
    // RETURN TO FRONTEND
    // --------------------------------------------------------

    return res.status(201).json({

      bookingId,

      totalAmount,

      lunchType,

      paymentStatus:
        'pending',

      // orderId deliberately NOT supplied yet.
      // It will be generated after successful payment.

      orders:
        dayOrders.map(
          order => ({

            orderId:
              null,

            day:
              order.day,

            qty:
              order.qty,

            amount:
              order.amount

          })
        )

    });


  } catch (error) {

    console.error(
      'Unexpected /api/orders error:',
      error
    );

    return res.status(500).json({

      error:
        'Could not create your order. Please try again.'

    });

  }

});


// ============================================================
// PAYU PAYMENT PARAMETERS
// ============================================================
//
// The frontend calls this after the booking is created.
//
// This endpoint creates a PayU transaction and hash.
// ============================================================

app.post(
  '/api/orders/:bookingId/payu-params',
  async (req, res) => {

    try {

      const {
        bookingId
      } = req.params;


      // ------------------------------------------------------
      // CHECK PAYU CONFIG
      // ------------------------------------------------------

      if (
        !payu.isConfigured()
      ) {

        console.error(
          'PayU is not configured.'
        );

        return res.status(503).json({

          error:
            'PayU payment is not configured. Please contact the administrator.'

        });

      }


      // ------------------------------------------------------
      // FIND BOOKING
      // ------------------------------------------------------

      const orders =
        await ordersCollection()
          .find({
            bookingId
          })
          .toArray();


      if (
        orders.length === 0
      ) {

        return res.status(404).json({
          error:
            'Booking not found.'
        });

      }


      // ------------------------------------------------------
      // DO NOT ALLOW ALREADY PAID BOOKINGS
      // ------------------------------------------------------

      const alreadyPaid =
        orders.some(
          order =>
            order.status === 'paid'
        );


      if (alreadyPaid) {

        return res.status(400).json({
          error:
            'This booking has already been paid.'
        });

      }


      // ------------------------------------------------------
      // CALCULATE TOTAL FROM DATABASE
      // ------------------------------------------------------

      const first =
        orders[0];


      const totalAmount =
        orders.reduce(
          (
            sum,
            order
          ) =>
            sum +
            Number(order.amount || 0),
          0
        );


      const amount =
        totalAmount.toFixed(2);


      // ------------------------------------------------------
      // PAYU DETAILS
      // ------------------------------------------------------

      const key =
        process.env.PAYU_MERCHANT_KEY;

      const salt =
        process.env.PAYU_SALT;


      const productinfo =
        `Lunch Bhog Booking ${bookingId}`;


      const firstname =
        first.name;


      const email =
        first.email;


      const phone =
        first.phone;


      // ------------------------------------------------------
      // UNIQUE PAYU TRANSACTION ID
      // ------------------------------------------------------

      const txnid =
        `${bookingId}-${Date.now().toString(36)}`
          .slice(0, 40);


      // ------------------------------------------------------
      // CALLBACK URL
      // ------------------------------------------------------

      const baseUrl =
        `${req.protocol}://${req.get('host')}`;


      const surl =
        `${baseUrl}/payu/callback`;


      const furl =
        `${baseUrl}/payu/callback`;


      // ------------------------------------------------------
      // CREATE PAYU HASH
      // ------------------------------------------------------

      const hash =
        payu.generateRequestHash({

          key,

          txnid,

          amount,

          productinfo,

          firstname,

          email,

          salt

        });


      // ------------------------------------------------------
      // SAVE PAYU ATTEMPT
      // ------------------------------------------------------

      await ordersCollection()
        .updateMany(

          {
            bookingId
          },

          {
            $set: {

              payuTxnId:
                txnid,

              payuExpectedAmount:
                amount,

              paymentStatus:
                'processing',

              payuAttemptedAt:
                new Date().toISOString()

            }

          }

        );


      // ------------------------------------------------------
      // RETURN PAYU FORM DATA
      // ------------------------------------------------------

      return res.json({

        url:
          payu.getPaymentUrl(),

        fields: {

          key,

          txnid,

          amount,

          productinfo,

          firstname,

          email,

          phone,

          surl,

          furl,

          hash

        }

      });


    } catch (error) {

      console.error(
        'PayU parameter generation error:',
        error
      );

      return res.status(500).json({

        error:
          'Could not initialize PayU payment.'

      });

    }

  }
);


// ============================================================
// PAYU CALLBACK
// ============================================================
//
// PayU redirects here after payment.
//
// IMPORTANT:
// We verify PayU's response hash BEFORE marking anything paid.
// ============================================================

app.post(
  '/payu/callback',
  async (req, res) => {

    try {

      const {

        status,

        txnid,

        amount,

        productinfo,

        firstname,

        email,

        key,

        hash,

        mihpayid

      } = req.body || {};


      // ------------------------------------------------------
      // HTML RESULT PAGE
      // ------------------------------------------------------

      function renderResult(
        ok,
        title,
        message
      ) {

        const safeTitle =
          String(title)
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');


        const safeMessage =
          String(message)
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');


        res.send(`<!DOCTYPE html>

<html>

<head>

<meta charset="UTF-8">

<meta
  name="viewport"
  content="width=device-width, initial-scale=1.0"
>

<title>${safeTitle}</title>

<style>

body {
  font-family: Arial, sans-serif;
  background: #FBF3E6;
  color: #2A1B14;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 24px;
  text-align: center;
}

.box {
  background: #FFFDF9;
  border: 1px solid #DECBAA;
  border-radius: 14px;
  padding: 32px 24px;
  max-width: 480px;
  width: 100%;
}

h1 {
  color: ${ok ? '#1F4B3F' : '#B0392F'};
  font-size: 24px;
  margin-bottom: 14px;
}

p {
  color: #6B5B4E;
  line-height: 1.6;
}

a {
  display: inline-block;
  margin-top: 18px;
  background: #A5303A;
  color: white;
  text-decoration: none;
  padding: 12px 22px;
  border-radius: 10px;
  font-weight: 600;
}

</style>

</head>

<body>

<div class="box">

<h1>${safeTitle}</h1>

<p>${safeMessage}</p>

<a href="/">Return to site</a>

</div>

</body>

</html>`);

      }


      // ------------------------------------------------------
      // BASIC CALLBACK VALIDATION
      // ------------------------------------------------------

      if (
        !txnid ||
        !hash
      ) {

        return renderResult(

          false,

          'Payment error',

          'We could not read the PayU payment response.'

        );

      }


      // ------------------------------------------------------
      // VERIFY PAYU RESPONSE HASH
      // ------------------------------------------------------

      const validHash =
        payu.verifyResponseHash({

          key,

          txnid,

          amount,

          productinfo,

          firstname,

          email,

          status,

          hash

        });


      if (
        !validHash
      ) {

        console.error(
          `PayU hash verification FAILED for transaction ${txnid}`
        );


        return renderResult(

          false,

          'Payment could not be verified',

          'The payment response could not be verified. If money was deducted, please contact the administrator with your transaction details.'

        );

      }


      // ------------------------------------------------------
      // FIND BOOKING USING PAYU TRANSACTION ID
      // ------------------------------------------------------

      const matchingOrders =
        await ordersCollection()
          .find({
            payuTxnId:
              txnid
          })
          .toArray();


      if (
        matchingOrders.length === 0
      ) {

        return renderResult(

          false,

          'Booking not found',

          `We could not match this payment to a booking. Transaction ID: ${mihpayid || txnid}`

        );

      }


      const bookingId =
        matchingOrders[0]
          .bookingId;


      // ------------------------------------------------------
      // CHECK EXPECTED AMOUNT
      // ------------------------------------------------------

      const expectedAmount =
        matchingOrders[0]
          .payuExpectedAmount;


      if (
        String(amount) !==
        String(expectedAmount)
      ) {

        console.error(

          `PayU amount mismatch for booking ${bookingId}. Expected ${expectedAmount}, received ${amount}`

        );


        return renderResult(

          false,

          'Amount mismatch',

          `The payment amount did not match your booking. Booking ID: ${bookingId}`

        );

      }


      // ======================================================
      // PAYMENT SUCCESS
      // ======================================================

      if (
        String(status).toLowerCase() ===
        'success'
      ) {

        // ----------------------------------------------------
        // CHECK IF ALREADY PROCESSED
        // ----------------------------------------------------

        const currentOrders =
          await ordersCollection()
            .find({
              bookingId
            })
            .toArray();


        const alreadyProcessed =
          currentOrders.some(
            order =>
              order.status === 'paid'
          );


        if (
          alreadyProcessed
        ) {

          return renderResult(

            true,

            'Payment already confirmed',

            `Your payment for Booking ID ${bookingId} has already been confirmed.`

          );

        }


        // ----------------------------------------------------
        // GENERATE FINAL ORDER IDS
        // ONLY NOW
        // ----------------------------------------------------

        const paidAt =
          new Date().toISOString();


        const bulkOperations =
          currentOrders.map(
            order => {

              const finalOrderId =
                generateOrderId(
                  DAY_CODES[
                    order.day
                  ]
                );


              return {

                updateOne: {

                  filter: {
                    _id:
                      order._id
                  },

                  update: {

                    $set: {

                      orderId:
                        finalOrderId,

                      status:
                        'paid',

                      paymentStatus:
                        'paid',

                      payuPaymentId:
                        mihpayid || '',

                      payuTxnId:
                        txnid,

                      paidAt

                    }

                  }

                }

              };

            }
          );


        // ----------------------------------------------------
        // UPDATE MONGODB
        // ----------------------------------------------------

        if (
          bulkOperations.length > 0
        ) {

          await ordersCollection()
            .bulkWrite(
              bulkOperations
            );

        }


        // ----------------------------------------------------
        // GET UPDATED ORDERS
        // ----------------------------------------------------

        const paidOrders =
          await ordersCollection()
            .find({
              bookingId
            })
            .toArray();


        const totalAmount =
          paidOrders.reduce(
            (
              sum,
              order
            ) =>
              sum +
              Number(order.amount || 0),
            0
          );


        const booking = {

          bookingId,

          name:
            paidOrders[0].name,

          phone:
            paidOrders[0].phone,

          email:
            paidOrders[0].email,

          lunchType:
            paidOrders[0].lunchType,

          totalAmount,

          dayOrders:
            paidOrders,

          payuPaymentId:
            mihpayid || '',

          payuTxnId:
            txnid,

          status:
            'paid',

          paidAt

        };


        // ----------------------------------------------------
        // SELLER EMAIL
        // ----------------------------------------------------

        sendOrderEmail(
          booking
        ).catch(
          err =>
            console.error(
              'Seller email failed:',
              err.message
            )
        );


        // ----------------------------------------------------
        // CUSTOMER RECEIPT EMAIL
        //
        // No UPI link is supplied because PayU is now the
        // only payment method.
        // ----------------------------------------------------

        sendCustomerReceiptEmail(
          booking,
          null
        ).catch(
          err =>
            console.error(
              'Customer receipt email failed:',
              err.message
            )
        );


        console.log(
          `PAYMENT SUCCESS: ${bookingId} | PayU ID: ${mihpayid || 'N/A'}`
        );


        // ----------------------------------------------------
        // SUCCESS PAGE
        // ----------------------------------------------------

        const orderList =
          paidOrders
            .map(
              order =>
                `${order.day}: ${order.orderId}`
            )
            .join(', ');


        return renderResult(

          true,

          'Payment successful',

          `Your payment has been confirmed. Your Order ID(s): ${orderList}. Booking ID: ${bookingId}.`

        );

      }


      // ======================================================
      // PAYMENT FAILED / CANCELLED
      // ======================================================

      await ordersCollection()
        .updateMany(

          {
            bookingId
          },

          {
            $set: {

              paymentStatus:
                'failed',

              payuLastStatus:
                status ||
                'failed',

              payuLastUpdatedAt:
                new Date().toISOString()

            }

          }

        );


      console.log(
        `PAYMENT NOT SUCCESSFUL: ${bookingId} | Status: ${status || 'unknown'}`
      );


      return renderResult(

        false,

        'Payment not completed',

        `Your payment was not successful (${status || 'unknown'}). No final Order ID has been generated. You may return to the booking page and try again.`

      );


    } catch (error) {

      console.error(
        'PayU callback error:',
        error
      );


      return renderResult(

        false,

        'Payment processing error',

        'There was an error while processing the payment response. If money was deducted, please contact the administrator with your PayU transaction ID.'

      );

    }

  }
);


// ============================================================
// ADMIN: GET ALL ORDERS
// ============================================================

app.get(
  '/api/admin/orders',
  requireAdmin,
  async (req, res) => {

    try {

      const orders =
        await ordersCollection()
          .find({})
          .sort({
            createdAt: -1
          })
          .toArray();


      res.json({
        orders
      });


    } catch (error) {

      console.error(
        'Admin orders error:',
        error
      );

      res.status(500).json({
        error:
          'Could not load orders.'
      });

    }

  }
);


// ============================================================
// ADMIN: STATS
// ============================================================

app.get(
  '/api/admin/stats',
  requireAdmin,
  async (req, res) => {

    try {

      const orders =
        await ordersCollection()
          .find({})
          .toArray();


      const totalOrders =
        orders.length;


      const totalBookings =
        new Set(
          orders.map(
            order =>
              order.bookingId
          )
        ).size;


      const totalPlates =
        orders.reduce(
          (
            sum,
            order
          ) =>
            sum +
            Number(order.qty || 0),
          0
        );


      const totalAmount =
        orders.reduce(
          (
            sum,
            order
          ) =>
            sum +
            Number(order.amount || 0),
          0
        );


      const paidOrders =
        orders.filter(
          order =>
            order.status === 'paid'
        );


      const paidAmount =
        paidOrders.reduce(
          (
            sum,
            order
          ) =>
            sum +
            Number(order.amount || 0),
          0
        );


      res.json({

        totalOrders,

        totalBookings,

        totalPlates,

        totalAmount,

        paidAmount

      });


    } catch (error) {

      console.error(
        'Admin stats error:',
        error
      );

      res.status(500).json({
        error:
          'Could not load statistics.'
      });

    }

  }
);


// ============================================================
// ADMIN: CHANGE INDIVIDUAL ORDER STATUS
// ============================================================
//
// Kept for admin compatibility.
//
// Normally PayU should control paid status automatically.
// ============================================================

app.post(
  '/api/admin/orders/:orderId/status',
  requireAdmin,
  async (req, res) => {

    try {

      const {
        orderId
      } = req.params;


      const {
        status
      } = req.body || {};


      if (
        ![
          'pending',
          'paid'
        ].includes(status)
      ) {

        return res.status(400).json({

          error:
            'Status must be "pending" or "paid".'

        });

      }


      const result =
        await ordersCollection()
          .updateOne(

            {
              orderId
            },

            {
              $set: {
                status,
                paymentStatus:
                  status === 'paid'
                    ? 'paid'
                    : 'pending'
              }

            }

          );


      if (
        result.matchedCount === 0
      ) {

        return res.status(404).json({

          error:
            'Order not found.'

        });

      }


      res.json({
        ok: true
      });


    } catch (error) {

      console.error(
        'Admin order status error:',
        error
      );

      res.status(500).json({
        error:
          'Could not update order status.'
      });

    }

  }
);


// ============================================================
// ADMIN: CHANGE WHOLE BOOKING STATUS
// ============================================================

app.post(
  '/api/admin/bookings/:bookingId/status',
  requireAdmin,
  async (req, res) => {

    try {

      const {
        bookingId
      } = req.params;


      const {
        status
      } = req.body || {};


      if (
        ![
          'pending',
          'paid'
        ].includes(status)
      ) {

        return res.status(400).json({

          error:
            'Status must be "pending" or "paid".'

        });

      }


      const result =
        await ordersCollection()
          .updateMany(

            {
              bookingId
            },

            {
              $set: {

                status,

                paymentStatus:
                  status === 'paid'
                    ? 'paid'
                    : 'pending'

              }

            }

          );


      if (
        result.matchedCount === 0
      ) {

        return res.status(404).json({

          error:
            'Booking not found.'

        });

      }


      res.json({

        ok: true,

        updated:
          result.matchedCount

      });


    } catch (error) {

      console.error(
        'Admin booking status error:',
        error
      );

      res.status(500).json({

        error:
          'Could not update booking status.'

      });

    }

  }
);


// ============================================================
// ADMIN: DELETE ONE BOOKING
// ============================================================

app.delete(
  '/api/admin/bookings/:bookingId',
  requireAdmin,
  async (req, res) => {

    try {

      const {
        bookingId
      } = req.params;


      const result =
        await ordersCollection()
          .deleteMany({
            bookingId
          });


      if (
        result.deletedCount === 0
      ) {

        return res.status(404).json({

          error:
            'Booking not found.'

        });

      }


      res.json({

        ok: true,

        deletedCount:
          result.deletedCount

      });


    } catch (error) {

      console.error(
        'Delete booking error:',
        error
      );

      res.status(500).json({

        error:
          'Could not delete booking.'

      });

    }

  }
);


// ============================================================
// ADMIN: DELETE EVERYTHING
// ============================================================

app.delete(
  '/api/admin/orders',
  requireAdmin,
  async (req, res) => {

    try {

      const {
        confirm
      } = req.body || {};


      if (
        confirm !== 'DELETE ALL'
      ) {

        return res.status(400).json({

          error:
            'Confirmation phrase did not match. Nothing was deleted.'

        });

      }


      const result =
        await ordersCollection()
          .deleteMany({});


      res.json({

        ok: true,

        deletedCount:
          result.deletedCount

      });


    } catch (error) {

      console.error(
        'Delete all orders error:',
        error
      );

      res.status(500).json({

        error:
          'Could not delete orders.'

      });

    }

  }
);


// ============================================================
// ADMIN: EXPORT CSV
// ============================================================

app.get(
  '/api/admin/orders/export',
  requireAdmin,
  async (req, res) => {

    try {

      const orders =
        await ordersCollection()
          .find({})
          .sort({
            createdAt: -1
          })
          .toArray();


      const header = [

        'Order ID',

        'Booking ID',

        'Day',

        'Lunch Type',

        'Name',

        'Phone',

        'Email',

        'Plates',

        'Amount',

        'Status',

        'Payment Status',

        'PayU Transaction ID',

        'PayU Payment ID',

        'Created At',

        'Paid At'

      ];


      const rows =
        orders.map(
          order => [

            order.orderId || '',

            order.bookingId || '',

            order.day || '',

            order.lunchType || '',

            order.name || '',

            order.phone || '',

            order.email || '',

            order.qty || '',

            order.amount || '',

            order.status || '',

            order.paymentStatus || '',

            order.payuTxnId || '',

            order.payuPaymentId || '',

            order.createdAt || '',

            order.paidAt || ''

          ]
        );


      const csv =
        [

          header,

          ...rows

        ]

          .map(
            row =>
              row
                .map(
                  value =>
                    `"${String(
                      value == null
                        ? ''
                        : value
                    ).replace(
                      /"/g,
                      '""'
                    )}"`
                )
                .join(',')
          )

          .join('\n');


      res.setHeader(
        'Content-Type',
        'text/csv'
      );


      res.setHeader(
        'Content-Disposition',
        'attachment; filename="bhog-orders.csv"'
      );


      res.send(csv);


    } catch (error) {

      console.error(
        'CSV export error:',
        error
      );

      res.status(500).json({

        error:
          'Could not export orders.'

      });

    }

  }
);


// ============================================================
// 404 FOR API ROUTES
// ============================================================

app.use(
  '/api',
  (req, res) => {

    res.status(404).json({

      error:
        'API endpoint not found.'

    });

  }
);


// ============================================================
// START SERVER
// ============================================================

const PORT =
  process.env.PORT || 3000;


connectDB()

  .then(() => {

    app.listen(
      PORT,
      () => {

        console.log(
          `Bhog backend running on port ${PORT}`
        );

        console.log(
          `Payment gateway: PayU`
        );

        console.log(
          `Booking days: ${VALID_DAYS.join(', ')}`
        );

      }
    );

  })

  .catch(
    error => {

      console.error(
        'Could not connect to MongoDB Atlas. Server not started.'
      );

      console.error(
        error
      );

      process.exit(1);

    }
  );
