const { MongoClient } = require('mongodb');

const uri = process.env.MONGODB_URI;

let client;
let db;

// Connects once and reuses the same MongoDB connection.
async function connectDB() {
  if (db) return db;

  if (!uri) {
    throw new Error(
      'MONGODB_URI is not set. Add it to your .env file locally or to Render Environment Variables.'
    );
  }

  client = new MongoClient(uri);

  await client.connect();

  db = client.db('bhogbooking');

  /*
   * IMPORTANT:
   *
   * Pending orders do NOT have an orderId.
   *
   * The orderId is generated only after successful
   * PayU payment.
   *
   * Therefore we need a PARTIAL UNIQUE INDEX.
   *
   * This allows multiple pending orders without an
   * orderId, while ensuring that actual orderIds are unique.
   */

  await db.collection('orders').createIndex(
    { orderId: 1 },
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

  console.log('Connected to MongoDB Atlas.');
  console.log('Verified partial unique index: orderId_1');

  return db;
}

function ordersCollection() {
  if (!db) {
    throw new Error(
      'MongoDB is not connected. Call connectDB() first.'
    );
  }

  return db.collection('orders');
}

function settingsCollection() {
  if (!db) {
    throw new Error(
      'MongoDB is not connected. Call connectDB() first.'
    );
  }

  return db.collection('settings');
}

module.exports = {
  connectDB,
  ordersCollection,
  settingsCollection
};
