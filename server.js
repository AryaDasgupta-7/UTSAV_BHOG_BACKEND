require('dotenv').config();

const path = require('path');
const express = require('express');
const crypto = require('crypto');

const { connectDB, ordersCollection } = require('./db');
const {
  sendOrderEmail,
  sendCustomerReceiptEmail
} = require('./email');
const payu = require('./payu');

const RATE_PER_PLATE = 500;

const ADMIN_API_KEY =
  process.env.ADMIN_API_KEY || 'change-me';

const VALID_LUNCH_TYPES = [
  'Packing',
  'Community Lunch (Dine-In)'
];

/*
|--------------------------------------------------------------------------
| BOOKING DAYS
|--------------------------------------------------------------------------
*/

const DAY_CODES = {
  Saptami: 'SAP',
  'Adhik Saptami': 'ADS',
  Ashtami: 'ASH',
  Navami: 'NAV'
};

const VALID_DAYS = Object.keys(DAY_CODES);

/*
|--------------------------------------------------------------------------
| APP
|--------------------------------------------------------------------------
*/

const app = express();

app.use(express.json());

/*
 * PayU sends the callback as application/x-www-form-urlencoded.
 */
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

/*
|--------------------------------------------------------------------------
| ID HELPERS
|--------------------------------------------------------------------------
*/

/*
 * Internal booking reference.
 *
 * IMPORTANT:
 * This is NOT the customer's final UTSAV Order ID.
 * It is only used internally while payment is pending.
 */
function generateInternalBookingId() {

  const random =
    crypto.randomBytes(8)
      .toString('hex')
      .toUpperCase();

  return `PENDING-${Date.now()}-${random}`;
}


/*
 * FINAL CUSTOMER-FACING ORDER ID.
 *
 * This function is ONLY called after PayU
 * payment has been successfully verified.
 */
function generateFinalOrderId(dayCode) {

  const year =
    new Date()
      .getFullYear()
      .toString()
      .slice(-2);

  const random =
    crypto.randomBytes(4)
      .toString('hex')
      .toUpperCase();

  return `UTSAV${year}-${dayCode}-${random}`;
}


/*
|--------------------------------------------------------------------------
| ADMIN AUTH
|--------------------------------------------------------------------------
*/

function requireAdmin(req, res, next) {

  const key =
    req.header('x-api-key');

  if (
    !key ||
    key !== ADMIN_API_KEY
  ) {

    return res
      .status(401)
      .json({
        error:
          'Unauthorized. Check your admin API key.'
      });

  }

  next();
}


/*
|--------------------------------------------------------------------------
| VALIDATION HELPERS
|--------------------------------------------------------------------------
*/

function cleanString(value) {

  return String(
    value == null ? '' : value
  ).trim();

}


/*
|--------------------------------------------------------------------------
| CREATE BOOKING
|--------------------------------------------------------------------------
|
| This creates a pending booking.
|
| NO final UTSAV Order ID is returned.
|
*/

app.post(
  '/api/orders',
  async (req, res) => {

    try {

      const {
        name,
        phone,
        email,
        lunchType,
        days
      } = req.body || {};


      /*
       * Name
       */

      if (
        !name ||
        typeof name !== 'string' ||
        !name.trim()
      ) {

        return res
          .status(400)
          .json({
            error:
              'Name is required.'
          });

      }


      /*
       * Phone
       */

      const cleanPhone =
        cleanString(phone);

      if (
        !/^[6-9]\d{9}$/.test(
          cleanPhone
        )
      ) {

        return res
          .status(400)
          .json({
            error:
              'Enter a valid 10-digit Indian mobile number.'
          });

      }


      /*
       * Email
       */

      const cleanEmail =
        cleanString(email);

      if (
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/
          .test(cleanEmail)
      ) {

        return res
          .status(400)
          .json({
            error:
              'Enter a valid email address.'
          });

      }


      /*
       * Lunch type
       */

      if (
        !VALID_LUNCH_TYPES
          .includes(lunchType)
      ) {

        return res
          .status(400)
          .json({
            error:
              'Please choose a lunch type.'
          });

      }


      /*
       * Days
       */

      if (
        !Array.isArray(days) ||
        days.length === 0
      ) {

        return res
          .status(400)
          .json({
            error:
              'Please select at least one day.'
          });

      }


      const seenDays =
        new Set();

      const cleanDays = [];


      for (
        const entry of days
      ) {

        const day =
          entry &&
          entry.day;

        const qty =
          parseInt(
            entry &&
            entry.qty,
            10
          );


        if (
          !VALID_DAYS
            .includes(day)
        ) {

          return res
            .status(400)
            .json({
              error:
                `"${day}" is not a valid booking day.`
            });

        }


        if (
          seenDays.has(day)
        ) {

          return res
            .status(400)
            .json({
              error:
                `"${day}" was selected more than once.`
            });

        }


        if (
          !Number.isInteger(qty) ||
          qty < 1 ||
          qty > 200
        ) {

          return res
            .status(400)
            .json({
              error:
                `Enter a valid number of plates for ${day} (1-200).`
            });

        }


        seenDays.add(day);

        cleanDays.push({
          day,
          qty
        });

      }


      /*
       * INTERNAL BOOKING ID
       *
       * This is NOT shown to the customer
       * as their final Order ID.
       */

      const bookingId =
        generateInternalBookingId();


      const createdAt =
        new Date().toISOString();


      const cleanName =
        cleanString(name);


      /*
       * Create one MongoDB document
       * per selected day.
       */

      const dayOrders =
        cleanDays.map(
          ({
            day,
            qty
          }) => ({

            bookingId,

            /*
             * orderId is null until payment
             * succeeds.
             */
            orderId: null,

            day,

            lunchType,

            name: cleanName,

            phone: cleanPhone,

            email: cleanEmail,

            qty,

            amount:
              qty *
              RATE_PER_PLATE,

            status: 'pending',

            paymentStatus:
              'pending',

            createdAt

          })
        );


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


      /*
       * Save pending booking.
       */

      await ordersCollection()
        .insertMany(
          dayOrders
        );


      /*
       * Send only the information
       * required by the frontend.
       *
       * The internal bookingId is returned
       * only so the frontend can initiate PayU.
       *
       * It is NOT the special UTSAV Order ID.
       */

      return res
        .status(201)
        .json({

          bookingId,

          totalAmount,

          lunchType,

          orders:
            dayOrders.map(
              order => ({

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
        'Create booking error:',
        error
      );

      return res
        .status(500)
        .json({
          error:
            'Could not create your booking right now. Please try again.'
        });

    }

  }
);


/*
|--------------------------------------------------------------------------
| PAYU INITIATION
|--------------------------------------------------------------------------
*/

app.post(
  '/api/orders/:bookingId/payu-params',
  async (req, res) => {

    try {

      const {
        bookingId
      } = req.params;


      /*
       * PayU credentials must exist
       * only on Render environment variables.
       */

      if (
        !payu.isConfigured()
      ) {

        return res
          .status(503)
          .json({
            error:
              'PayU is not configured on the server.'
          });

      }


      /*
       * Find pending booking.
       */

      const orders =
        await ordersCollection()
          .find({
            bookingId
          })
          .toArray();


      if (
        orders.length === 0
      ) {

        return res
          .status(404)
          .json({
            error:
              'Booking not found.'
          });

      }


      /*
       * Do not allow payment initiation
       * for already paid bookings.
       */

      const alreadyPaid =
        orders.some(
          order =>
            order.status === 'paid'
        );


      if (alreadyPaid) {

        return res
          .status(400)
          .json({
            error:
              'This booking has already been paid.'
          });

      }


      const first =
        orders[0];


      const totalAmount =
        orders.reduce(
          (
            sum,
            order
          ) =>
            sum +
            Number(order.amount),
          0
        );


      const amount =
        totalAmount.toFixed(2);


      const key =
        process.env
          .PAYU_MERCHANT_KEY;


      const salt =
        process.env.PAYU_SALT;


      const productinfo =
        `UTSAV Bhog Booking`;


      const firstname =
        first.name;


      const email =
        first.email;


      const phone =
        first.phone;


      /*
       * Fresh transaction ID for every
       * PayU payment attempt.
       */

      const txnid =
        `UTSAV-${Date.now()}-${crypto
          .randomBytes(4)
          .toString('hex')}`
          .slice(0, 40);


      const baseUrl =
        `${req.protocol}://${req.get('host')}`;


      const surl =
        `${baseUrl}/payu/callback`;


      const furl =
        `${baseUrl}/payu/callback`;


      /*
       * Generate request hash on SERVER.
       */

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


      /*
       * Save payment attempt details.
       *
       * These are used during callback verification.
       */

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
                'initiated'

            }

          }
        );


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
        'PayU initiation error:',
        error
      );

      return res
        .status(500)
        .json({
          error:
            'Could not start PayU payment.'
        });

    }

  }
);


/*
|--------------------------------------------------------------------------
| PAYU CALLBACK
|--------------------------------------------------------------------------
|
| This is the MOST IMPORTANT part.
|
| The customer-facing final Order ID is
| generated ONLY inside the SUCCESS branch
| AFTER:
|
| 1. PayU response hash verified
| 2. Transaction ID matched
| 3. Amount matched
| 4. Payment status is success
|
|--------------------------------------------------------------------------
*/

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


      /*
       * Small HTML response helper.
       */

      function renderResult(
        success,
        title,
        message,
        finalOrderId = null
      ) {

        const safeMessage =
          String(message)
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
            );


        const orderSection =
          finalOrderId
            ? `
              <div style="
                margin:20px 0;
                padding:14px;
                background:#EFF5F2;
                border:1px solid #CFE1D8;
                border-radius:10px;
              ">
                <div style="
                  font-size:11px;
                  color:#6B5B4E;
                  margin-bottom:5px;
                ">
                  YOUR UTSAV ORDER ID
                </div>

                <strong style="
                  font-size:20px;
                  color:#1F4B3F;
                ">
                  ${finalOrderId}
                </strong>
              </div>
            `
            : '';


        return res.send(`

          <!DOCTYPE html>

          <html>

          <head>

            <meta charset="UTF-8">

            <meta
              name="viewport"
              content="width=device-width,initial-scale=1.0"
            >

            <title>
              ${success
                ? 'Payment Successful'
                : 'Payment Status'}
            </title>

            <style>

              body{
                font-family:
                  Arial,
                  sans-serif;

                background:#FBF3E6;

                color:#2A1B14;

                min-height:100vh;

                display:flex;

                align-items:center;

                justify-content:center;

                padding:20px;
              }

              .box{
                max-width:450px;
                width:100%;
                background:#FFFDF9;
                border:1px solid #DECBAA;
                border-radius:14px;
                padding:30px;
                text-align:center;
              }

              h1{
                color:
                  ${success
                    ? '#1F4B3F'
                    : '#B0392F'};
              }

              p{
                color:#6B5B4E;
                line-height:1.6;
              }

              a{
                display:inline-block;
                margin-top:15px;
                padding:12px 20px;
                background:#A5303A;
                color:white;
                text-decoration:none;
                border-radius:9px;
              }

            </style>

          </head>

          <body>

            <div class="box">

              <h1>
                ${title}
              </h1>

              <p>
                ${safeMessage}
              </p>

              ${orderSection}

              <a href="/">
                Return to UTSAV
              </a>

            </div>

          </body>

          </html>

        `);

      }


      /*
       * Basic callback validation.
       */

      if (
        !txnid ||
        !hash
      ) {

        return renderResult(
          false,
          'Payment Error',
          'The payment response was incomplete. If money was deducted, please contact the UTSAV help desk.'
        );

      }


      /*
       * Verify PayU response hash.
       */

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


      if (!validHash) {

        console.error(
          'PayU response hash verification FAILED:',
          txnid
        );

        return renderResult(
          false,
          'Payment Could Not Be Verified',
          'The PayU response could not be verified. If money was deducted, please contact the UTSAV help desk.'
        );

      }


      /*
       * Find the booking using the
       * transaction ID we generated.
       */

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
          'Booking Not Found',
          `We could not match this payment to a booking. Transaction: ${mihpayid || txnid}`
        );

      }


      const bookingId =
        matchingOrders[0]
          .bookingId;


      /*
       * Expected amount was generated
       * by OUR server.
       */

      const expectedAmount =
        matchingOrders[0]
          .payuExpectedAmount;


      if (
        String(amount) !==
        String(expectedAmount)
      ) {

        console.error(
          'PayU amount mismatch:',
          {
            bookingId,
            expectedAmount,
            receivedAmount:
              amount
          }
        );


        return renderResult(
          false,
          'Amount Mismatch',
          'The payment amount did not match the booking amount. Please contact the UTSAV help desk.'
        );

      }


      /*
       * PAYMENT SUCCESS
       */

      if (
        String(status)
          .toLowerCase() ===
        'success'
      ) {


        /*
         * Check whether another callback
         * has already completed this booking.
         */

        const existingPaid =
          await ordersCollection()
            .findOne({
              bookingId,
              status:'paid'
            });


        let finalOrderId;


        if (
          existingPaid &&
          existingPaid.orderId
        ) {

          /*
           * Idempotency:
           * don't create another order ID
           * if PayU sends callback twice.
           */

          finalOrderId =
            existingPaid.orderId;

        } else {

          /*
           * Generate the REAL customer-facing
           * Order ID only NOW.
           */

          finalOrderId =
            generateFinalOrderId(
              DAY_CODES[
                matchingOrders[0].day
              ]
            );

        }


        const paidAt =
          new Date()
            .toISOString();


        /*
         * IMPORTANT:
         *
         * All selected days belong to one
         * payment transaction.
         *
         * Give every day the same final
         * booking/order reference.
         *
         * Individual day IDs are generated
         * using their own day code.
         */

        const bulkOperations =
          matchingOrders.map(
            order => ({

              updateOne: {

                filter: {
                  _id:
                    order._id
                },

                update: {

                  $set: {

                    status:
                      'paid',

                    paymentStatus:
                      'paid',

                    finalOrderId,

                    orderId:
                      order.orderId ||
                      generateFinalOrderId(
                        DAY_CODES[
                          order.day
                        ]
                      ),

                    payuPaymentId:
                      mihpayid ||
                      '',

                    paidAt,

                    payuStatus:
                      'success'

                  }

                }

              }

            })
          );


        if (
          bulkOperations.length
        ) {

          await ordersCollection()
            .bulkWrite(
              bulkOperations
            );

        }


        /*
         * Reload paid orders.
         */

        const paidOrders =
          await ordersCollection()
            .find({
              bookingId
            })
            .toArray();


        const totalPaid =
          paidOrders.reduce(
            (
              sum,
              order
            ) =>
              sum +
              Number(order.amount),
            0
          );


        /*
         * Build booking object
         * for email notifications.
         */

        const booking = {

          bookingId,

          finalOrderId,

          name:
            paidOrders[0].name,

          phone:
            paidOrders[0].phone,

          email:
            paidOrders[0].email,

          lunchType:
            paidOrders[0].lunchType,

          totalAmount:
            totalPaid,

          dayOrders:
            paidOrders,

          createdAt:
            paidOrders[0].createdAt,

          paidAt,

          payuPaymentId:
            mihpayid || ''

        };


        /*
         * Seller email.
         *
         * This is deliberately sent AFTER
         * successful payment.
         */

        sendOrderEmail(
          booking
        )
        .catch(
          error =>
            console.error(
              'Seller payment email failed:',
              error.message
            )
        );


        /*
         * Customer receipt.
         */

        sendCustomerReceiptEmail(
          booking
        )
        .catch(
          error =>
            console.error(
              'Customer receipt email failed:',
              error.message
            )
        );


        return renderResult(
          true,
          'Payment Successful',
          'Your PayU payment has been verified successfully. Your bhog booking is confirmed.',
          finalOrderId
        );

      }


      /*
       * PAYMENT FAILED / CANCELLED
       */

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
                'failed'

            }

          }
        );


      return renderResult(
        false,
        'Payment Not Completed',
        `Your payment was not completed (${status || 'unknown'}). You can return to the UTSAV website and try again.`
      );


    } catch (error) {

      console.error(
        'PayU callback error:',
        error
      );


      return res
        .status(500)
        .send(`
          <h2>
            Payment processing error
          </h2>

          <p>
            Please contact the UTSAV help desk
            if money was deducted.
          </p>

          <a href="/">
            Return to UTSAV
          </a>
        `);

    }

  }
);


/*
|--------------------------------------------------------------------------
| ADMIN — ORDERS
|--------------------------------------------------------------------------
*/

app.get(
  '/api/admin/orders',
  requireAdmin,
  async (req, res) => {

    try {

      const orders =
        await ordersCollection()
          .find({})
          .sort({
            createdAt:
              -1
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

      res
        .status(500)
        .json({
          error:
            'Could not load orders.'
        });

    }

  }
);


/*
|--------------------------------------------------------------------------
| ADMIN — STATS
|--------------------------------------------------------------------------
*/

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
            Number(order.qty),
          0
        );


      const totalAmount =
        orders.reduce(
          (
            sum,
            order
          ) =>
            sum +
            Number(order.amount),
          0
        );


      const paidAmount =
        orders
          .filter(
            order =>
              order.status === 'paid'
          )
          .reduce(
            (
              sum,
              order
            ) =>
              sum +
              Number(order.amount),
            0
          );


      const pendingAmount =
        orders
          .filter(
            order =>
              order.status !== 'paid'
          )
          .reduce(
            (
              sum,
              order
            ) =>
              sum +
              Number(order.amount),
            0
          );


      res.json({

        totalOrders,

        totalBookings,

        totalPlates,

        totalAmount,

        paidAmount,

        pendingAmount

      });

    } catch (error) {

      console.error(
        'Stats error:',
        error
      );

      res
        .status(500)
        .json({
          error:
            'Could not load statistics.'
        });

    }

  }
);


/*
|--------------------------------------------------------------------------
| ADMIN — MARK SINGLE ORDER
|--------------------------------------------------------------------------
*/

app.post(
  '/api/admin/orders/:orderId/status',
  requireAdmin,
  async (req, res) => {

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

      return res
        .status(400)
        .json({
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

      return res
        .status(404)
        .json({
          error:
            'Order not found.'
        });

    }


    res.json({
      ok:true
    });

  }
);


/*
|--------------------------------------------------------------------------
| ADMIN — MARK WHOLE BOOKING
|--------------------------------------------------------------------------
*/

app.post(
  '/api/admin/bookings/:bookingId/status',
  requireAdmin,
  async (req, res) => {

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

      return res
        .status(400)
        .json({
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

      return res
        .status(404)
        .json({
          error:
            'Booking not found.'
        });

    }


    res.json({

      ok:true,

      updated:
        result.matchedCount

    });

  }
);


/*
|--------------------------------------------------------------------------
| ADMIN — DELETE BOOKING
|--------------------------------------------------------------------------
*/

app.delete(
  '/api/admin/bookings/:bookingId',
  requireAdmin,
  async (req, res) => {

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

      return res
        .status(404)
        .json({
          error:
            'Booking not found.'
        });

    }


    res.json({

      ok:true,

      deletedCount:
        result.deletedCount

    });

  }
);


/*
|--------------------------------------------------------------------------
| ADMIN — DELETE ALL
|--------------------------------------------------------------------------
*/

app.delete(
  '/api/admin/orders',
  requireAdmin,
  async (req, res) => {

    const {
      confirm
    } = req.body || {};


    if (
      confirm !==
      'DELETE ALL'
    ) {

      return res
        .status(400)
        .json({
          error:
            'Confirmation phrase did not match. Nothing was deleted.'
        });

    }


    const result =
      await ordersCollection()
        .deleteMany({});


    res.json({

      ok:true,

      deletedCount:
        result.deletedCount

    });

  }
);


/*
|--------------------------------------------------------------------------
| ADMIN — CSV EXPORT
|--------------------------------------------------------------------------
*/

app.get(
  '/api/admin/orders/export',
  requireAdmin,
  async (req, res) => {

    try {

      const orders =
        await ordersCollection()
          .find({})
          .sort({
            createdAt:
              -1
          })
          .toArray();


      const header = [

        'Final Order ID',

        'Day Order ID',

        'Internal Booking Reference',

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

        'Paid At',

        'Created At'

      ];


      const rows =
        orders.map(
          order => [

            order.finalOrderId ||
              '',

            order.orderId ||
              '',

            order.bookingId ||
              '',

            order.day ||
              '',

            order.lunchType ||
              '',

            order.name ||
              '',

            order.phone ||
              '',

            order.email ||
              '',

            order.qty ||
              '',

            order.amount ||
              '',

            order.status ||
              '',

            order.paymentStatus ||
              '',

            order.payuTxnId ||
              '',

            order.payuPaymentId ||
              '',

            order.paidAt ||
              '',

            order.createdAt ||
              ''

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

      res
        .status(500)
        .send(
          'Could not export orders.'
        );

    }

  }
);


/*
|--------------------------------------------------------------------------
| SERVER
|--------------------------------------------------------------------------
*/

const PORT =
  process.env.PORT ||
  3000;


connectDB()

  .then(() => {

    app.listen(
      PORT,
      () => {

        console.log(
          `Bhog backend running on port ${PORT}`
        );

      }

    );

  })

  .catch(
    error => {

      console.error(
        'Could not connect to MongoDB Atlas.'
      );

      console.error(
        error.message
      );

      process.exit(1);

    }
  );

