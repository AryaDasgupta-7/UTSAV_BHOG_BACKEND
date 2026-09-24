// PayU India (redirect/hosted-checkout) integration.
//
// Flow: our server computes a hash (using the merchant salt, which never
// leaves the server) and hands the customer's browser a form that
// auto-submits to PayU's hosted payment page. PayU later redirects the
// browser back to our /payu/callback with the result — and we verify THAT
// with a second, different hash before ever marking anything as paid.
// Trusting the redirect without checking this hash would let anyone fake a
// "successful" payment just by crafting their own POST to our callback.

const crypto = require('crypto');

function isConfigured() {
  return !!(process.env.PAYU_MERCHANT_KEY && process.env.PAYU_SALT);
}

function getMode() {
  return (process.env.PAYU_MODE || 'test').toLowerCase();
}

function getPaymentUrl() {
  return getMode() === 'production'
    ? 'https://secure.payu.in/_payment'
    : 'https://test.payu.in/_payment';
}

// PayU's documented request-hash formula:
// sha512(key|txnid|amount|productinfo|firstname|email|udf1|udf2|udf3|udf4|udf5||||||SALT)
// Built with array.join so the pipe count can't drift by a typo.
function generateRequestHash({ key, txnid, amount, productinfo, firstname, email, salt }) {
  const parts = [
    key, txnid, amount, productinfo, firstname, email,
    '', '', '', '', '', // udf1-udf5, unused
    '', '', '', '', '',  // 5 reserved empty fields before SALT
    salt
  ];
  return crypto.createHash('sha512').update(parts.join('|')).digest('hex');
}

// PayU's documented response (reverse) hash formula:
// sha512(SALT|status||||||udf5|udf4|udf3|udf2|udf1|email|firstname|productinfo|amount|txnid|key)
function generateResponseHash({ key, txnid, amount, productinfo, firstname, email, status, salt }) {
  const parts = [
    salt, status,
    '', '', '', '', '', // 5 reserved empty fields, then udf5-udf1
    '', '', '', '', '',  // udf5-udf1, unused
    email, firstname, productinfo, amount, txnid, key
  ];
  return crypto.createHash('sha512').update(parts.join('|')).digest('hex');
}

function verifyResponseHash(fields) {
  const salt = process.env.PAYU_SALT;
  if (!salt) return false;
  const expected = generateResponseHash({ ...fields, salt });
  return expected === fields.hash;
}

module.exports = {
  isConfigured,
  getMode,
  getPaymentUrl,
  generateRequestHash,
  verifyResponseHash
};
