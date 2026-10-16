const { MongoClient } = require('mongodb');

const uri = process.env.MONGODB_URI;
let client;
let db;

// Connects once and reuses the same connection for every request.
// Call this and await it before touching orders/settings.
async function connectDB() {
  if (db) return db;

  if (!uri) {
    throw new Error(
      'MONGODB_URI is not set. Add it to your .env file (locally) or your ' +
      'Render Environment Variables (when deployed).'
    );
  }

  client = new MongoClient(uri);
  await client.connect();
  db = client.db('bhogbooking');

  // Make sure orderId is always unique, and speeds up lookups.
  await db.collection('orders').createIndex({ orderId: 1 }, { unique: true });

  console.log('Connected to MongoDB Atlas.');
  return db;
}

function ordersCollection() {
  return db.collection('orders');
}

function settingsCollection() {
  return db.collection('settings');
}

module.exports = { connectDB, ordersCollection, settingsCollection };
