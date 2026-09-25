const crypto = require('crypto');


/*
|--------------------------------------------------------------------------
| PAYU CONFIGURATION
|--------------------------------------------------------------------------
*/

function isConfigured() {

  return Boolean(

    process.env.PAYU_MERCHANT_KEY &&

    process.env.PAYU_SALT

  );

}


/*
|--------------------------------------------------------------------------
| MODE
|--------------------------------------------------------------------------
*/

function getMode() {

  return (
    process.env.PAYU_MODE ||
    'test'
  ).toLowerCase();

}


/*
|--------------------------------------------------------------------------
| PAYU PAYMENT URL
|--------------------------------------------------------------------------
*/

function getPaymentUrl() {

  if (
    getMode() ===
    'production'
  ) {

    return 'https://secure.payu.in/_payment';

  }

  return 'https://test.payu.in/_payment';

}


/*
|--------------------------------------------------------------------------
| REQUEST HASH
|--------------------------------------------------------------------------
|
| key|txnid|amount|productinfo|firstname|email|
| udf1|udf2|udf3|udf4|udf5||||||SALT
|
|--------------------------------------------------------------------------
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

  const parts = [

    key,

    txnid,

    amount,

    productinfo,

    firstname,

    email,

    '',

    '',

    '',

    '',

    '',

    '',

    '',

    '',

    '',

    '',

    '',

    salt

  ];


  return crypto

    .createHash(
      'sha512'
    )

    .update(
      parts.join('|')
    )

    .digest('hex');

}


/*
|--------------------------------------------------------------------------
| RESPONSE HASH
|--------------------------------------------------------------------------
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

  const parts = [

    salt,

    status,

    '',

    '',

    '',

    '',

    '',

    '',

    '',

    '',

    '',

    '',

    email,

    firstname,

    productinfo,

    amount,

    txnid,

    key

  ];


  return crypto

    .createHash(
      'sha512'
    )

    .update(
      parts.join('|')
    )

    .digest('hex');

}


/*
|--------------------------------------------------------------------------
| VERIFY PAYU RESPONSE
|--------------------------------------------------------------------------
*/

function verifyResponseHash(fields) {

  const salt =
    process.env.PAYU_SALT;


  if (!salt) {

    return false;

  }


  if (
    !fields ||
    !fields.hash
  ) {

    return false;

  }


  const expected =
    generateResponseHash({

      key:
        fields.key,

      txnid:
        fields.txnid,

      amount:
        fields.amount,

      productinfo:
        fields.productinfo,

      firstname:
        fields.firstname,

      email:
        fields.email,

      status:
        fields.status,

      salt

    });


  /*
   * Timing-safe comparison.
   */

  try {

    const expectedBuffer =
      Buffer.from(
        expected,
        'hex'
      );

    const receivedBuffer =
      Buffer.from(
        fields.hash,
        'hex'
      );


    if (
      expectedBuffer.length !==
      receivedBuffer.length
    ) {

      return false;

    }


    return crypto.timingSafeEqual(
      expectedBuffer,
      receivedBuffer
    );

  } catch (error) {

    return false;

  }

}


module.exports = {

  isConfigured,

  getMode,

  getPaymentUrl,

  generateRequestHash,

  generateResponseHash,

  verifyResponseHash

};

