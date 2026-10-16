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
  // If an orderId_1 index already exists with slightly different options
  // (e.g. a partial filter from an earlier version), keep using it: it already
  // enforces uniqueness. Don't let that stop the server from starting.
  try {
    await db.collection('orders').createIndex({ orderId: 1 }, { unique: true });
  } catch (e) {
    if (e.code === 85 || e.code === 86 || /existing index/i.test(e.message)) {
      console.warn('orderId index already exists with different options; keeping the existing one.');
    } else {
      throw e;
    }
  }

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
