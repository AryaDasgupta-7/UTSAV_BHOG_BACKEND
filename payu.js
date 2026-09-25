const crypto = require('crypto');

/*
 * ============================================================
 * PAYU CONFIGURATION
 * ============================================================
 */

function isConfigured() {
  return Boolean(
    process.env.PAYU_MERCHANT_KEY &&
    process.env.PAYU_SALT
  );
}

function getMode() {
  return String(
    process.env.PAYU_MODE || 'test'
  ).trim().toLowerCase();
}

function getPaymentUrl() {
  if (getMode() === 'production') {
    return 'https://secure.payu.in/_payment';
  }

  return 'https://test.payu.in/_payment';
}


/*
 * ============================================================
 * PAYU REQUEST HASH
 * ============================================================
 *
 * PayU formula:
 *
 * sha512(
 *   key|
 *   txnid|
 *   amount|
 *   productinfo|
 *   firstname|
 *   email|
 *   udf1|
 *   udf2|
 *   udf3|
 *   udf4|
 *   udf5|
 *   ||||||
 *   SALT
 * )
 *
 * We are not using UDF fields, so all five UDF
 * positions are empty.
 *
 * IMPORTANT:
 * The six pipes after udf5 are also required.
 * ============================================================
 */

function generateRequestHash({
  key,
  txnid,
  amount,
  productinfo,
  firstname,
  email,
  salt
}) {

  const cleanKey = String(key || '').trim();
  const cleanTxnid = String(txnid || '').trim();
  const cleanAmount = String(amount || '').trim();
  const cleanProductinfo = String(productinfo || '').trim();
  const cleanFirstname = String(firstname || '').trim();
  const cleanEmail = String(email || '').trim();
  const cleanSalt = String(salt || '').trim();

  const hashString =
    cleanKey +
    '|' +
    cleanTxnid +
    '|' +
    cleanAmount +
    '|' +
    cleanProductinfo +
    '|' +
    cleanFirstname +
    '|' +
    cleanEmail +
    '|' +
    '' +
    '|' +
    '' +
    '|' +
    '' +
    '|' +
    '' +
    '|' +
    '' +
    '||||||' +
    cleanSalt;

  console.log(
    'PayU hash input:',
    hashString.replace(cleanSalt, '[SALT_HIDDEN]')
  );

  return crypto
    .createHash('sha512')
    .update(hashString, 'utf8')
    .digest('hex')
    .toLowerCase();
}


/*
 * ============================================================
 * PAYU RESPONSE HASH
 * ============================================================
 *
 * PayU response formula:
 *
 * sha512(
 *   SALT|
 *   status|
 *   ||||||
 *   udf5|
 *   udf4|
 *   udf3|
 *   udf2|
 *   udf1|
 *   email|
 *   firstname|
 *   productinfo|
 *   amount|
 *   txnid|
 *   key
 * )
 *
 * ============================================================
 */

function generateResponseHash({
  key,
  txnid,
  amount,
  productinfo,
  firstname,
  email,
  status,
  salt
}) {

  const cleanKey = String(key || '').trim();
  const cleanTxnid = String(txnid || '').trim();
  const cleanAmount = String(amount || '').trim();
  const cleanProductinfo = String(productinfo || '').trim();
  const cleanFirstname = String(firstname || '').trim();
  const cleanEmail = String(email || '').trim();
  const cleanStatus = String(status || '').trim();
  const cleanSalt = String(salt || '').trim();

  const hashString =
    cleanSalt +
    '|' +
    cleanStatus +
    '||||||' +
    '' +
    '|' +
    '' +
    '|' +
    '' +
    '|' +
    '' +
    '|' +
    '' +
    '|' +
    cleanEmail +
    '|' +
    cleanFirstname +
    '|' +
    cleanProductinfo +
    '|' +
    cleanAmount +
    '|' +
    cleanTxnid +
    '|' +
    cleanKey;

  return crypto
    .createHash('sha512')
    .update(hashString, 'utf8')
    .digest('hex')
    .toLowerCase();
}


/*
 * ============================================================
 * VERIFY PAYU RESPONSE
 * ============================================================
 */

function verifyResponseHash(fields) {

  const salt = process.env.PAYU_SALT;

  if (!salt) {
    console.error(
      'PAYU_SALT is missing.'
    );

    return false;
  }

  const expectedHash =
    generateResponseHash({
      ...fields,
      salt
    });

  const receivedHash =
    String(fields.hash || '')
      .trim()
      .toLowerCase();

  return expectedHash === receivedHash;
}


/*
 * ============================================================
 * EXPORTS
 * ============================================================
 */

module.exports = {
  isConfigured,
  getMode,
  getPaymentUrl,
  generateRequestHash,
  generateResponseHash,
  verifyResponseHash
};
