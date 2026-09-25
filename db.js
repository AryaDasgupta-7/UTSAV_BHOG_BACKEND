const { MongoClient } = require('mongodb');

/*
 * ============================================================
 * MONGODB CONFIGURATION
 * ============================================================
 */

const uri = process.env.MONGODB_URI;

const DB_NAME =
  process.env.MONGODB_DB_NAME || 'bhogbooking';

const ORDERS_COLLECTION =
  'orders';

const SETTINGS_COLLECTION =
  'settings';


/*
 * ============================================================
 * CONNECTION STATE
 * ============================================================
 */

let client = null;
let db = null;
let connectingPromise = null;


/*
 * ============================================================
 * CONNECT TO MONGODB
 * ============================================================
 *
 * Connects only once and reuses the same connection.
 *
 * This is important on Render because creating a new
 * MongoClient for every request can quickly exhaust
 * MongoDB connections.
 *
 * ============================================================
 */

async function connectDB() {

  /*
   * Already connected.
   */
  if (db) {
    return db;
  }


  /*
   * If another connection attempt is already running,
   * wait for that same connection attempt.
   */
  if (connectingPromise) {
    return connectingPromise;
  }


  /*
   * Check MongoDB URI.
   */
  if (!uri) {

    throw new Error(
      'MONGODB_URI is not set. Add it to your .env file locally or to Render Environment Variables.'
    );

  }


  connectingPromise = (async () => {

    try {

      console.log(
        'Connecting to MongoDB Atlas...'
      );


      /*
       * Create MongoDB client.
       */
      client = new MongoClient(uri, {

        /*
         * Keep a reasonable connection pool.
         */
        maxPoolSize: 10,

        minPoolSize: 0,

        /*
         * Don't wait forever for a connection.
         */
        serverSelectionTimeoutMS: 10000,

        /*
         * Socket timeout.
         */
        socketTimeoutMS: 45000,

        /*
         * Retry writes where supported.
         */
        retryWrites: true

      });


      /*
       * Connect.
       */
      await client.connect();


      /*
       * Select database.
       */
      db = client.db(DB_NAME);


      /*
       * Force a simple database operation so that
       * connection problems are detected during startup
       * instead of during the first customer request.
       */
      await db.command({
        ping: 1
      });


      console.log(
        `Connected to MongoDB Atlas database: ${DB_NAME}`
      );


      /*
       * ======================================================
       * ORDERS COLLECTION
       * ======================================================
       */

      const orders =
        db.collection(
          ORDERS_COLLECTION
        );


      /*
       * ======================================================
       * ORDER ID INDEX
       * ======================================================
       *
       * IMPORTANT:
       *
       * Pending orders do NOT have an orderId.
       *
       * orderId is generated only after successful payment.
       *
       * Therefore:
       *
       * - pending orders can have no orderId
       * - paid orders must have unique orderIds
       *
       * Partial unique index solves this.
       *
       * Only documents where orderId is a string participate
       * in the unique constraint.
       *
       * ======================================================
       */

      try {

        await orders.createIndex(
          {
            orderId: 1
          },
          {
            name: 'orderId_1',
            unique: true,
            partialFilterExpression: {
              orderId: {
                $type: 'string'
              }
            }
          }
        );

      } catch (indexError) {

        /*
         * If an older version of the application created
         * orderId_1 differently, MongoDB will report an
         * IndexKeySpecsConflict.
         *
         * In that situation we inspect the existing index
         * and recreate it correctly.
         */

        if (
          indexError &&
          (
            indexError.code === 85 ||
            indexError.code === 86
          )
        ) {

          console.warn(
            'Existing orderId_1 index has an incompatible definition. Recreating it...'
          );


          try {

            await orders.dropIndex(
              'orderId_1'
            );

          } catch (dropError) {

            /*
             * Index may not exist anymore.
             */
            if (
              dropError &&
              dropError.codeName !==
                'IndexNotFound'
            ) {

              throw dropError;

            }

          }


          await orders.createIndex(
            {
              orderId: 1
            },
            {
              name: 'orderId_1',
              unique: true,
              partialFilterExpression: {
                orderId: {
                  $type: 'string'
                }
              }
            }
          );

        } else {

          throw indexError;

        }

      }


      /*
       * ======================================================
       * BOOKING ID INDEX
       * ======================================================
       *
       * A single booking can contain multiple day orders.
       *
       * Example:
       *
       * BOOK-ABC
       *   Saptami
       *   Ashtami
       *   Navami
       *
       * The application frequently searches:
       *
       * { bookingId: 'BOOK-ABC' }
       *
       * So create an index for fast lookup.
       *
       * ======================================================
       */

      await orders.createIndex(
        {
          bookingId: 1
        },
        {
          name: 'bookingId_1'
        }
      );


      /*
       * ======================================================
       * PAYU TRANSACTION ID INDEX
       * ======================================================
       *
       * IMPORTANT:
       *
       * DO NOT make this index unique.
       *
       * One PayU transaction belongs to one booking, but
       * one booking can contain multiple day-order documents.
       *
       * Therefore several MongoDB documents can legitimately
       * contain the same payuTxnId.
       *
       * Example:
       *
       * Booking:
       *   BOOK-123
       *
       * PayU txn:
       *   BOOK-123-abc
       *
       * MongoDB documents:
       *
       *   Saptami  -> payuTxnId = BOOK-123-abc
       *   Ashtami  -> payuTxnId = BOOK-123-abc
       *   Navami   -> payuTxnId = BOOK-123-abc
       *
       * ======================================================
       */

      await orders.createIndex(
        {
          payuTxnId: 1
        },
        {
          name: 'payuTxnId_1',
          partialFilterExpression: {
            payuTxnId: {
              $type: 'string'
            }
          }
        }
      );


      /*
       * ======================================================
       * PAYMENT STATUS INDEX
       * ======================================================
       *
       * Useful for admin queries and payment reconciliation.
       *
       * ======================================================
       */

      await orders.createIndex(
        {
          paymentStatus: 1
        },
        {
          name: 'paymentStatus_1'
        }
      );


      /*
       * ======================================================
       * STATUS INDEX
       * ======================================================
       */

      await orders.createIndex(
        {
          status: 1
        },
        {
          name: 'status_1'
        }
      );


      /*
       * ======================================================
       * CREATED AT INDEX
       * ======================================================
       *
       * Admin panel sorts orders by:
       *
       * createdAt: -1
       *
       * ======================================================
       */

      await orders.createIndex(
        {
          createdAt: -1
        },
        {
          name: 'createdAt_-1'
        }
      );


      /*
       * ======================================================
       * SETTINGS COLLECTION
       * ======================================================
       *
       * No special indexes are currently required.
       * The collection will be created automatically when
       * the first setting is inserted.
       *
       * ======================================================
       */

      db.collection(
        SETTINGS_COLLECTION
      );


      /*
       * ======================================================
       * VERIFY IMPORTANT INDEXES
       * ======================================================
       */

      const indexes =
        await orders
          .listIndexes()
          .toArray();


      console.log(
        'MongoDB orders indexes:'
      );


      indexes.forEach(
        index => {

          console.log(
            `  - ${index.name}`
          );

        }
      );


      console.log(
        'MongoDB database initialization completed successfully.'
      );


      return db;

    } catch (error) {

      /*
       * Reset state if startup fails.
       */
      db = null;

      if (client) {

        try {

          await client.close();

        } catch (closeError) {

          console.error(
            'Error closing failed MongoDB connection:',
            closeError
          );

        }

      }

      client = null;

      console.error(
        'MongoDB connection failed:'
      );

      console.error(
        error
      );

      throw error;

    } finally {

      connectingPromise = null;

    }

  })();


  return connectingPromise;

}


/*
 * ============================================================
 * ORDERS COLLECTION
 * ============================================================
 */

function ordersCollection() {

  if (!db) {

    throw new Error(
      'MongoDB is not connected. Call connectDB() first.'
    );

  }

  return db.collection(
    ORDERS_COLLECTION
  );

}


/*
 * ============================================================
 * SETTINGS COLLECTION
 * ============================================================
 */

function settingsCollection() {

  if (!db) {

    throw new Error(
      'MongoDB is not connected. Call connectDB() first.'
    );

  }

  return db.collection(
    SETTINGS_COLLECTION
  );

}


/*
 * ============================================================
 * CLOSE DATABASE
 * ============================================================
 *
 * Useful when Render/server shuts down.
 *
 * ============================================================
 */

async function closeDB() {

  if (!client) {
    return;
  }


  try {

    await client.close();

    console.log(
      'MongoDB connection closed.'
    );

  } finally {

    client = null;
    db = null;
    connectingPromise = null;

  }

}


/*
 * ============================================================
 * EXPORTS
 * ============================================================
 */

module.exports = {

  connectDB,

  ordersCollection,

  settingsCollection,

  closeDB

};
