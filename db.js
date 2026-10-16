const { MongoClient } = require('mongodb');

const uri = process.env.MONGODB_URI;
let client;
let db;

// An older version of this app (or a manual change in Atlas) may have already
// created an "orderId_1" index with different options (e.g. a partial filter).
// MongoDB then refuses to create ours with the same name and the server used to
// crash on startup. If that happens, replace the old index with the correct one.
// An index problem should never stop the site from starting, so any remaining
// failure is logged as a warning instead of thrown.
async function ensureOrderIdIndex(orders) {
  const spec = { orderId: 1 };
  const opts = { unique: true, name: 'orderId_1' };
  try {
    await orders.createIndex(spec, opts);
  } catch (err) {
    // 85 = IndexOptionsConflict, 86 = IndexKeySpecsConflict
    if (err.code !== 85 && err.code !== 86) {
      console.warn('Could not create orderId index:', err.message);
      return;
    }
    try {
      console.log('Replacing existing orderId_1 index with the correct definition...');
      await orders.dropIndex('orderId_1');
      await orders.createIndex(spec, opts);
    } catch (err2) {
      console.warn('Could not replace orderId index (continuing anyway):', err2.message);
    }
  }
}

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
  await ensureOrderIdIndex(db.collection('orders'));

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
