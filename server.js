require('dotenv').config();

const crypto = require('crypto');
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


// ============================================================
// CONFIGURATION
// ============================================================

const RATE_PER_PLATE = 500;

const ADMIN_API_KEY =
  process.env.ADMIN_API_KEY || 'change-me';


// ============================================================
// PAYU CONFIGURATION
// ============================================================

const PAYU_KEY =
  String(process.env.PAYU_MERCHANT_KEY || '').trim();

const PAYU_SALT =
  String(process.env.PAYU_SALT || '').trim();

const PAYU_PAYMENT_URL =
  process.env.PAYU_PAYMENT_URL ||
  'https://test.payu.in/_payment';


// ============================================================
// BOOKING DAYS
// ============================================================

const DAY_CODES = {
  'Saptami': 'SAP',
  'Adhik Saptami': 'ADS',
  'Ashtami': 'ASH',
  'Navami': 'NAV'
};

const VALID_DAYS =
  Object.keys(DAY_CODES);

const VALID_LUNCH_TYPES = [
  'Packing',
  'Community Lunch (Dine-In)'
];


// ============================================================
// EXPRESS APP
// ============================================================

const app = express();

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

function generateBookingId() {

  const timestamp =
    Date.now()
      .toString(36)
      .toUpperCase();

  const random =
    crypto
      .randomBytes(4)
      .toString('hex')
      .toUpperCase();

  return `BOOK-${timestamp}-${random}`;
}


function generateOrderId(dayCode) {

  const year =
    new Date()
      .getFullYear()
      .toString()
      .slice(-2);

  const random =
    crypto
      .randomBytes(4)
      .toString('hex')
      .toUpperCase();

  const time =
    Date.now()
      .toString()
      .slice(-5);

  return `UTSAV${year}-${dayCode}-${random}${time}`;
}


function generatePayUTxnId(bookingId) {

  const random =
    crypto
      .randomBytes(4)
      .toString('hex')
      .toUpperCase();

  const timestamp =
    Date.now()
      .toString(36)
      .toUpperCase();

  return `${bookingId}-${timestamp}-${random}`
    .replace(/[^A-Za-z0-9_-]/g, '')
    .slice(0, 40);
}


// ============================================================
// PAYU REQUEST HASH
// ============================================================

function generatePayURequestHash({
  key,
  txnid,
  amount,
  productinfo,
  firstname,
  email,
  udf1 = '',
  udf2 = '',
  udf3 = '',
  udf4 = '',
  udf5 = '',
  salt
}) {

  const hashString =
    [
      String(key || '').trim(),
      String(txnid || '').trim(),
      String(amount || '').trim(),
      String(productinfo || '').trim(),
      String(firstname || '').trim(),
      String(email || '').trim(),

      String(udf1 || ''),
      String(udf2 || ''),
      String(udf3 || ''),
      String(udf4 || ''),
      String(udf5 || ''),

      '',
      '',
      '',
      '',
      '',

      String(salt || '').trim()
    ].join('|');


  console.log(
    'PayU request hash generated.'
  );


  return crypto
    .createHash('sha512')
    .update(hashString, 'utf8')
    .digest('hex')
    .toLowerCase();
}


// ============================================================
// PAYU RESPONSE HASH
// ============================================================

function generatePayUResponseHash({
  salt,
  status,
  udf1 = '',
  udf2 = '',
  udf3 = '',
  udf4 = '',
  udf5 = '',
  email,
  firstname,
  productinfo,
  amount,
  txnid,
  key,
  additionalCharges = ''
}) {

  let hashString;


  if (
    additionalCharges !== null &&
    additionalCharges !== undefined &&
    String(additionalCharges).trim() !== ''
  ) {

    hashString =
      [
        String(additionalCharges).trim(),
        String(salt || '').trim(),
        String(status || '').trim(),

        '',
        '',
        '',
        '',
        '',

        String(udf5 || ''),
        String(udf4 || ''),
        String(udf3 || ''),
        String(udf2 || ''),
        String(udf1 || ''),

        String(email || '').trim(),
        String(firstname || '').trim(),
        String(productinfo || '').trim(),
        String(amount || '').trim(),
        String(txnid || '').trim(),
        String(key || '').trim()
      ].join('|');

  } else {

    hashString =
      [
        String(salt || '').trim(),
        String(status || '').trim(),

        '',
        '',
        '',
        '',
        '',

        String(udf5 || ''),
        String(udf4 || ''),
        String(udf3 || ''),
        String(udf2 || ''),
        String(udf1 || ''),

        String(email || '').trim(),
        String(firstname || '').trim(),
        String(productinfo || '').trim(),
        String(amount || '').trim(),
        String(txnid || '').trim(),
        String(key || '').trim()
      ].join('|');
  }


  return crypto
    .createHash('sha512')
    .update(hashString, 'utf8')
    .digest('hex')
    .toLowerCase();
}


// ============================================================
// VERIFY PAYU RESPONSE HASH
// ============================================================

function verifyPayUResponseHash(params) {

  if (!PAYU_SALT) {

    console.error(
      'PAYU_SALT is missing.'
    );

    return false;
  }


  if (!params.hash) {

    console.error(
      'PayU response hash is missing.'
    );

    return false;
  }


  const calculatedHash =
    generatePayUResponseHash({

      salt:
        PAYU_SALT,

      status:
        params.status,

      udf1:
        params.udf1 || '',

      udf2:
        params.udf2 || '',

      udf3:
        params.udf3 || '',

      udf4:
        params.udf4 || '',

      udf5:
        params.udf5 || '',

      email:
        params.email || '',

      firstname:
        params.firstname || '',

      productinfo:
        params.productinfo || '',

      amount:
        params.amount || '',

      txnid:
        params.txnid || '',

      key:
        params.key || '',

      additionalCharges:
        params.additionalCharges || ''
    });


  const receivedHash =
    String(params.hash)
      .trim()
      .toLowerCase();


  if (
    receivedHash.length !==
    calculatedHash.length
  ) {

    console.error(
      'PayU response hash length mismatch.'
    );

    return false;
  }


  try {

    return crypto.timingSafeEqual(

      Buffer.from(
        receivedHash,
        'utf8'
      ),

      Buffer.from(
        calculatedHash,
        'utf8'
      )

    );

  } catch (error) {

    console.error(
      'PayU hash comparison error:',
      error
    );

    return false;
  }
}


// ============================================================
// ADMIN AUTHENTICATION
// ============================================================

function requireAdmin(
  req,
  res,
  next
) {

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

app.get(
  '/api/health',
  (req, res) => {

    res.json({

      ok: true,

      service:
        'UTSAV Bhog Booking Backend',

      paymentGateway:
        'PayU'

    });

  }
);


// ============================================================
// CREATE BOOKING
// ============================================================

app.post(
  '/api/orders',
  async (req, res) => {

    try {

      console.log(
        'NEW ORDER REQUEST:',
        JSON.stringify(
          req.body,
          null,
          2
        )
      );


      const {
        name,
        phone,
        email,
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
      // VALIDATE DAYS
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


        // NEW:
        // Lunch type is now stored INSIDE EACH DAY
        const lunchType =
          entry &&
          entry.lunchType;


        // ------------------------------------------------------
        // VALIDATE DAY
        // ------------------------------------------------------

        if (
          !VALID_DAYS.includes(day)
        ) {

          return res.status(400).json({

            error:
              `"${day}" is not a valid booking day.`

          });
        }


        // ------------------------------------------------------
        // PREVENT DUPLICATE DAY
        // ------------------------------------------------------

        if (
          seenDays.has(day)
        ) {

          return res.status(400).json({

            error:
              `"${day}" was selected more than once.`

          });
        }


        // ------------------------------------------------------
        // VALIDATE QUANTITY
        // ------------------------------------------------------

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


        // ------------------------------------------------------
        // VALIDATE LUNCH TYPE FOR THIS DAY
        // ------------------------------------------------------

        if (
          !VALID_LUNCH_TYPES.includes(
            lunchType
          )
        ) {

          return res.status(400).json({

            error:
              `Please choose a valid lunch type for ${day}.`

          });
        }


        seenDays.add(day);


        // ------------------------------------------------------
        // SAVE CLEAN DAY
        // ------------------------------------------------------

        cleanDays.push({

          day,

          qty:
            qtyNum,

          lunchType

        });

      }


      // --------------------------------------------------------
      // BOOKING ID
      // --------------------------------------------------------

      const bookingId =
        generateBookingId();


      const createdAt =
        new Date().toISOString();


      const cleanName =
        name.trim();


      // --------------------------------------------------------
      // CREATE PENDING ORDERS
      // --------------------------------------------------------

      const dayOrders =
        cleanDays.map(
          ({
            day,
            qty,
            lunchType
          }) => {

            return {

              bookingId,

              day,

              // NEW:
              // Each order gets its own lunch type
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
      // TOTAL AMOUNT
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
          'FAILED TO SAVE BOOKING:'
        );

        console.error(
          dbError
        );


        return res.status(500).json({

          error:
            'Could not save your order right now. Please try again.'

        });

      }


      console.log(
        `Pending booking created: ${bookingId}`
      );


      console.log(
        `Amount: ₹${totalAmount}`
      );


      // --------------------------------------------------------
      // RESPONSE
      // --------------------------------------------------------

      return res.status(201).json({

        bookingId,

        totalAmount,

        paymentStatus:
          'pending',

        orders:
          dayOrders.map(
            order => ({

              day:
                order.day,

              qty:
                order.qty,

              // NEW:
              lunchType:
                order.lunchType,

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

  }
);


// ============================================================
// PAYU PAYMENT PARAMETERS
// ============================================================

app.post(
  '/api/orders/:bookingId/payu-params',
  async (req, res) => {

    try {

      const {
        bookingId
      } = req.params;


      // --------------------------------------------------------
      // CHECK PAYU CONFIGURATION
      // --------------------------------------------------------

      if (
        !PAYU_KEY ||
        !PAYU_SALT
      ) {

        console.error(
          'PAYU_MERCHANT_KEY or PAYU_SALT is missing.'
        );


        return res.status(503).json({

          error:
            'PayU payment is not configured correctly on the server.'

        });
      }


      // --------------------------------------------------------
      // FIND BOOKING
      // --------------------------------------------------------

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


      // --------------------------------------------------------
      // CHECK ALREADY PAID
      // --------------------------------------------------------

      const alreadyPaid =
        orders.some(
          order =>
            order.status === 'paid'
        );


      if (
        alreadyPaid
      ) {

        return res.status(400).json({

          error:
            'This booking has already been paid.'

        });
      }


      // --------------------------------------------------------
      // CALCULATE TOTAL FROM DATABASE
      // --------------------------------------------------------

      const first =
        orders[0];


      const totalAmount =
        orders.reduce(
          (
            sum,
            order
          ) =>
            sum +
            Number(
              order.amount || 0
            ),
          0
        );


      const amount =
        totalAmount.toFixed(2);


      // --------------------------------------------------------
      // PAYU DATA
      // --------------------------------------------------------

      const productinfo =
        `Lunch Bhog Booking ${bookingId}`;


      const firstname =
        String(
          first.name || ''
        ).trim();


      const email =
        String(
          first.email || ''
        ).trim();


      const phone =
        String(
          first.phone || ''
        ).trim();


      // --------------------------------------------------------
      // UDF VALUES
      // --------------------------------------------------------

      const udf1 = '';
      const udf2 = '';
      const udf3 = '';
      const udf4 = '';
      const udf5 = '';


      // --------------------------------------------------------
      // UNIQUE TRANSACTION ID
      // --------------------------------------------------------

      const txnid =
        generatePayUTxnId(
          bookingId
        );


      // --------------------------------------------------------
      // CALLBACK URL
      // --------------------------------------------------------

      const baseUrl =
        `${req.protocol}://${req.get('host')}`;


      const surl =
        `${baseUrl}/payu/callback`;


      const furl =
        `${baseUrl}/payu/callback`;


      // --------------------------------------------------------
      // GENERATE PAYU REQUEST HASH
      // --------------------------------------------------------

      const hash =
        generatePayURequestHash({

          key:
            PAYU_KEY,

          txnid,

          amount,

          productinfo,

          firstname,

          email,

          udf1,

          udf2,

          udf3,

          udf4,

          udf5,

          salt:
            PAYU_SALT

        });


      // --------------------------------------------------------
      // SAVE PAYMENT ATTEMPT
      // --------------------------------------------------------

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


      console.log(
        '=========================================='
      );

      console.log(
        'PAYU PAYMENT INITIALIZED'
      );

      console.log(
        `Booking ID: ${bookingId}`
      );

      console.log(
        `Transaction ID: ${txnid}`
      );

      console.log(
        `Amount: ₹${amount}`
      );

      console.log(
        `Customer: ${firstname}`
      );

      console.log(
        `Email: ${email}`
      );

      console.log(
        `PayU URL: ${PAYU_PAYMENT_URL}`
      );

      console.log(
        '=========================================='
      );


      // --------------------------------------------------------
      // RETURN PAYU FORM DATA
      // --------------------------------------------------------

      return res.json({

        url:
          PAYU_PAYMENT_URL,

        fields: {

          key:
            PAYU_KEY,

          txnid,

          amount,

          productinfo,

          firstname,

          email,

          phone,

          udf1,

          udf2,

          udf3,

          udf4,

          udf5,

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

app.post(
  '/payu/callback',
  async (req, res) => {

    try {

      console.log(
        '=========================================='
      );

      console.log(
        'PAYU CALLBACK RECEIVED'
      );

      console.log(
        JSON.stringify(
          req.body,
          null,
          2
        )
      );

      console.log(
        '=========================================='
      );


      const {

        status,

        txnid,

        amount,

        productinfo,

        firstname,

        email,

        key,

        hash,

        mihpayid,

        udf1 = '',
        udf2 = '',
        udf3 = '',
        udf4 = '',
        udf5 = '',

        additionalCharges,
        additional_charges

      } = req.body || {};


      // --------------------------------------------------------
      // RESULT PAGE
      // --------------------------------------------------------

      function renderResult(
        ok,
        title,
        message
      ) {

        const safeTitle =
          String(title)
            .replace(
              /</g,
              '&lt;'
            )
            .replace(
              />/g,
              '&gt;'
            );


        const safeMessage =
          String(message)
            .replace(
              /</g,
              '&lt;'
            )
            .replace(
              />/g,
              '&gt;'
            );


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
  max-width: 900px;
  width: 100%;
  box-sizing: border-box;
}

h1 {
  color: ${ok ? '#1F4B3F' : '#B0392F'};
  font-size: 32px;
  margin-bottom: 14px;
}

p {
  color: #6B5B4E;
  line-height: 1.6;
  font-size: 18px;
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


      // --------------------------------------------------------
      // BASIC VALIDATION
      // --------------------------------------------------------

      if (
        !txnid ||
        !hash ||
        !status
      ) {

        console.error(
          'PayU callback missing txnid, hash or status.'
        );


        return renderResult(

          false,

          'Payment error',

          'We could not read the PayU payment response.'

        );
      }


      // --------------------------------------------------------
      // VERIFY PAYU KEY
      // --------------------------------------------------------

      if (
        String(key || '').trim() !==
        PAYU_KEY
      ) {

        console.error(
          'PayU callback key mismatch.'
        );


        return renderResult(

          false,

          'Payment verification failed',

          'The payment response could not be verified.'

        );
      }


      // --------------------------------------------------------
      // ADDITIONAL CHARGES
      // --------------------------------------------------------

      const extraCharges =
        additionalCharges ||
        additional_charges ||
        '';


      // --------------------------------------------------------
      // VERIFY RESPONSE HASH
      // --------------------------------------------------------

      const validHash =
        verifyPayUResponseHash({

          key,

          txnid,

          amount,

          productinfo,

          firstname,

          email,

          status,

          hash,

          udf1,

          udf2,

          udf3,

          udf4,

          udf5,

          additionalCharges:
            extraCharges

        });


      if (
        !validHash
      ) {

        console.error(
          '=========================================='
        );

        console.error(
          'PAYU HASH VERIFICATION FAILED'
        );

        console.error(
          `Transaction ID: ${txnid}`
        );

        console.error(
          `Status: ${status}`
        );

        console.error(
          `Amount: ${amount}`
        );

        console.error(
          '=========================================='
        );


        return renderResult(

          false,

          'Payment could not be verified',

          'The payment response could not be verified. If money was deducted, please contact the administrator with your PayU transaction details.'

        );
      }


      console.log(
        `PayU response hash verified successfully for ${txnid}`
      );


      // --------------------------------------------------------
      // FIND BOOKING
      // --------------------------------------------------------

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


      // --------------------------------------------------------
      // VERIFY AMOUNT
      // --------------------------------------------------------

      const expectedAmount =
        matchingOrders[0]
          .payuExpectedAmount;


      const receivedAmount =
        Number(amount);


      const expectedAmountNumber =
        Number(expectedAmount);


      if (
        !Number.isFinite(receivedAmount) ||
        !Number.isFinite(expectedAmountNumber) ||
        Math.abs(
          receivedAmount -
          expectedAmountNumber
        ) > 0.001
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


      // ========================================================
      // PAYMENT SUCCESS
      // ========================================================

      if (
        String(status)
          .trim()
          .toLowerCase() ===
        'success'
      ) {

        // ------------------------------------------------------
        // GET CURRENT BOOKING
        // ------------------------------------------------------

        const currentOrders =
          await ordersCollection()
            .find({

              bookingId

            })
            .toArray();


        if (
          currentOrders.length === 0
        ) {

          return renderResult(

            false,

            'Booking not found',

            `Booking ${bookingId} could not be found.`

          );
        }


        // ------------------------------------------------------
        // CHECK ALREADY PAID
        // ------------------------------------------------------

        const alreadyPaid =
          currentOrders.some(
            order =>
              order.status === 'paid'
          );


        if (
          alreadyPaid
        ) {

          const existingIds =
            currentOrders
              .filter(
                order =>
                  order.orderId
              )
              .map(
                order =>
                  order.orderId
              )
              .join(', ');


          return renderResult(

            true,

            'Payment already confirmed',

            `Your payment has already been confirmed. Order ID(s): ${existingIds || 'Already confirmed'}. Booking ID: ${bookingId}.`

          );
        }


        // ------------------------------------------------------
        // GENERATE FINAL ORDER IDS
        // ------------------------------------------------------

        const paidAt =
          new Date().toISOString();


        const bulkOperations =
          currentOrders.map(
            order => {

              const dayCode =
                DAY_CODES[
                  order.day
                ];


              if (
                !dayCode
              ) {

                throw new Error(
                  `No day code found for ${order.day}`
                );
              }


              const finalOrderId =
                generateOrderId(
                  dayCode
                );


              return {

                updateOne: {

                  filter: {

                    _id:
                      order._id,

                    bookingId:
                      bookingId,

                    status: {
                      $ne: 'paid'
                    }

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

                      payuLastStatus:
                        status,

                      paidAt

                    }

                  }

                }

              };

            }

          );


        // ------------------------------------------------------
        // UPDATE MONGODB
        // ------------------------------------------------------

        await ordersCollection()
          .bulkWrite(
            bulkOperations
          );


        // ------------------------------------------------------
        // GET UPDATED BOOKING
        // ------------------------------------------------------

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
              Number(
                order.amount || 0
              ),
            0
          );


        // ------------------------------------------------------
        // CREATE BOOKING OBJECT
        // ------------------------------------------------------
        //
        // IMPORTANT:
        // lunchType is now stored individually in each
        // paidOrders item.
        //
        // Therefore dayOrders contains:
        //
        // day
        // qty
        // lunchType
        // amount
        //
        // ------------------------------------------------------

        const booking = {

          bookingId,

          name:
            paidOrders[0].name,

          phone:
            paidOrders[0].phone,

          email:
            paidOrders[0].email,

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


        // --------------------------------------------------------
        // SELLER + CUSTOMER EMAILS
        // --------------------------------------------------------

        const emailResults =
          await Promise.allSettled([

            sendOrderEmail(
              booking
            ),

            sendCustomerReceiptEmail(
              booking,
              null
            )

          ]);


        emailResults.forEach(
          (
            result,
            index
          ) => {

            if (
              result.status ===
              'rejected'
            ) {

              console.error(

                index === 0
                  ? 'Seller email failed:'
                  : 'Customer receipt email failed:',

                result.reason

              );

            }

          }
        );


        // ------------------------------------------------------
        // LOG SUCCESS
        // ------------------------------------------------------

        console.log(
          '=========================================='
        );

        console.log(
          'PAYMENT SUCCESS'
        );

        console.log(
          `Booking ID: ${bookingId}`
        );

        console.log(
          `PayU Transaction ID: ${txnid}`
        );

        console.log(
          `PayU Payment ID: ${mihpayid || 'N/A'}`
        );

        console.log(
          `Amount: ₹${totalAmount}`
        );

        console.log(
          'Order IDs:'
        );


        paidOrders.forEach(
          order => {

            console.log(
              `  ${order.day}: ${order.orderId} | ${order.lunchType}`
            );

          }
        );


        console.log(
          '=========================================='
        );


        // ------------------------------------------------------
        // CUSTOMER ORDER IDS
        // ------------------------------------------------------

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


      // ========================================================
      // PAYMENT FAILED / CANCELLED / PENDING
      // ========================================================

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

        `Your payment was not successful (${status || 'unknown'}). No final Order ID has been generated. You can return to the booking page and try again.`

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
            Number(
              order.qty || 0
            ),
          0
        );


      const totalAmount =
        orders.reduce(
          (
            sum,
            order
          ) =>
            sum +
            Number(
              order.amount || 0
            ),
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
              Number(
                order.amount || 0
              ),
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


      const existing =
        await ordersCollection()
          .findOne({

            orderId

          });


      if (
        !existing
      ) {

        return res.status(404).json({

          error:
            'Order not found.'

        });
      }


      const updateFields = {

        status,

        paymentStatus:
          status === 'paid'
            ? 'paid'
            : 'pending'

      };


      if (
        status === 'paid'
      ) {

        updateFields.paidAt =
          new Date().toISOString();


        if (
          !existing.orderId
        ) {

          const dayCode =
            DAY_CODES[
              existing.day
            ];


          if (
            dayCode
          ) {

            updateFields.orderId =
              generateOrderId(
                dayCode
              );

          }

        }

      }


      const result =
        await ordersCollection()
          .updateOne(

            {
              _id:
                existing._id
            },

            {
              $set:
                updateFields
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


      const bookingOrders =
        await ordersCollection()
          .find({

            bookingId

          })
          .toArray();


      if (
        bookingOrders.length === 0
      ) {

        return res.status(404).json({

          error:
            'Booking not found.'

        });
      }


      // --------------------------------------------------------
      // MARK WHOLE BOOKING AS PAID
      // --------------------------------------------------------

      if (
        status === 'paid'
      ) {

        const operations =
          bookingOrders.map(
            order => {

              const dayCode =
                DAY_CODES[
                  order.day
                ];


              const update = {

                status:
                  'paid',

                paymentStatus:
                  'paid',

                paidAt:
                  new Date().toISOString()

              };


              if (
                !order.orderId &&
                dayCode
              ) {

                update.orderId =
                  generateOrderId(
                    dayCode
                  );

              }


              return {

                updateOne: {

                  filter: {

                    _id:
                      order._id

                  },

                  update: {

                    $set:
                      update

                  }

                }

              };

            }

          );


        await ordersCollection()
          .bulkWrite(
            operations
          );


      } else {

        // ------------------------------------------------------
        // MARK BOOKING AS PENDING
        // ------------------------------------------------------

        await ordersCollection()
          .updateMany(

            {
              bookingId
            },

            {

              $set: {

                status:
                  'pending',

                paymentStatus:
                  'pending'

              },

              $unset: {

                paidAt: ''

              }

            }

          );

      }


      res.json({

        ok: true,

        updated:
          bookingOrders.length

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
// ADMIN: DELETE ALL ORDERS
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
// API 404
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
          'Payment gateway: PayU'
        );

        console.log(
          `PayU URL: ${PAYU_PAYMENT_URL}`
        );

        console.log(
          `PayU configured: ${Boolean(
            PAYU_KEY &&
            PAYU_SALT
          )}`
        );

        console.log(
          `Booking days: ${VALID_DAYS.join(', ')}`
        );

        console.log(
          `Rate per plate: ₹${RATE_PER_PLATE}`
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
