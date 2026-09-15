// Uploads payment screenshots to Cloudinary's free tier instead of MongoDB.
// MongoDB Atlas's free cluster only has 512MB total, and image files would
// eat through that fast. Cloudinary gives 25GB free and is built for exactly
// this — we only ever store the resulting image URL (a short string) in
// MongoDB, never the image bytes themselves.

const cloudinary = require('cloudinary').v2;

function isConfigured() {
  return !!(
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
  );
}

function configure() {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
  });
}

// Uploads an image buffer (from multer's memory storage) to Cloudinary and
// returns the public URL. Throws if Cloudinary isn't configured or the
// upload fails, so the caller can show a clear error to the customer.
async function uploadScreenshot(buffer, bookingId) {
  if (!isConfigured()) {
    throw new Error(
      'Image storage is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY ' +
      'and CLOUDINARY_API_SECRET in your environment variables.'
    );
  }
  configure();

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: 'bhog-payment-screenshots',
        public_id: bookingId,
        overwrite: true,
        resource_type: 'image'
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result.secure_url);
      }
    );
    uploadStream.end(buffer);
  });
}

module.exports = { uploadScreenshot, isConfigured };
