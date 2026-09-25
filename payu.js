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


/*
 * ============================================================
 * PAYU MODE
 * ============================================================
 *
 * .env:
 *
 * PAYU_MODE=test
 *
 * OR
 *
 * PAYU_MODE=production
 *
 * ============================================================
 */

function getMode() {
  return String(
    process.env.PAYU_MODE || 'test'
  )
    .trim()
    .toLowerCase();
}


/*
 * ============================================================
 * PAYU PAYMENT URL
 * ============================================================
 */

function getPaymentUrl() {
  if (getMode() === 'production') {
    return 'https://secure.payu.in/_payment';
  }

  return 'https://test.payu.in/_payment';
}


/*
 * ============================================================
 * CLEAN VALUE
 * ============================================================
 *
 * Important:
 * Do NOT accidentally convert undefined/null into the
 * string "undefined" or "null".
 *
 * ============================================================
 */

function value(value) {
  if (value === undefined || value === null) {
    return '';
  }

  return String(value);
}


/*
 * ============================================================
 * SHA512
 * ============================================================
 */

function sha512(input) {
  return crypto
    .createHash('sha512')
    .update(input, 'utf8')
    .digest('hex')
    .toLowerCase();
}


/*
 * ============================================================
 * CONSTANT-TIME HASH COMPARISON
 * ============================================================
 */

function hashesMatch(receivedHash, calculatedHash) {
  const received = value(receivedHash)
    .trim()
    .toLowerCase();

  const calculated = value(calculatedHash)
    .trim()
    .toLowerCase();

  if (!received || !calculated) {
    return false;
  }

  if (received.length !== calculated.length) {
    return false;
  }

  try {
    return crypto.timingSafeEqual(
      Buffer.from(received, 'utf8'),
      Buffer.from(calculated, 'utf8')
    );
  } catch (error) {
    return false;
  }
}


/*
 * ============================================================
 * PAYU REQUEST HASH
 * ============================================================
 *
 * Standard PayU payment request hash:
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
 * PayU documentation:
 *
 * key|txnid|amount|productinfo|firstname|email|
 * udf1|udf2|udf3|udf4|udf5||||||SALT
 *
 * ============================================================
 */

function generateRequestHash({
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

  salt,

  additionalCharges = ''
}) {

  const cleanKey = value(key);
  const cleanTxnid = value(txnid);
  const cleanAmount = value(amount);
  const cleanProductinfo = value(productinfo);
  const cleanFirstname = value(firstname);
  const cleanEmail = value(email);

  const cleanUdf1 = value(udf1);
  const cleanUdf2 = value(udf2);
  const cleanUdf3 = value(udf3);
  const cleanUdf4 = value(udf4);
  const cleanUdf5 = value(udf5);

  const cleanSalt = value(salt);

  /*
   * Normal payment request.
   */
  let hashString =
    [
      cleanKey,
      cleanTxnid,
      cleanAmount,
      cleanProductinfo,
      cleanFirstname,
      cleanEmail,
      cleanUdf1,
      cleanUdf2,
      cleanUdf3,
      cleanUdf4,
      cleanUdf5,
      '',
      '',
      '',
      '',
      '',
      cleanSalt
    ].join('|');


  /*
   * If additional_charges is being explicitly sent
   * in the payment request, PayU requires it at the
   * end of the request hash.
   *
   * We normally DO NOT use this for your integration.
   */
  if (additionalCharges) {
    hashString =
      [
        cleanKey,
        cleanTxnid,
        cleanAmount,
        cleanProductinfo,
        cleanFirstname,
        cleanEmail,
        cleanUdf1,
        cleanUdf2,
        cleanUdf3,
        cleanUdf4,
        cleanUdf5,
        '',
        '',
        '',
        '',
        '',
        cleanSalt,
        value(additionalCharges)
      ].join('|');
  }


  /*
   * NEVER log the actual salt.
   */
  const logString =
    hashString.replace(
      cleanSalt,
      '[SALT_HIDDEN]'
    );

  console.log(
    'PayU request hash input:',
    logString
  );


  return sha512(hashString);
}


/*
 * ============================================================
 * PAYU RESPONSE / REVERSE HASH
 * ============================================================
 *
 * Normal PayU response:
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
 *
 * With additional charges:
 *
 * sha512(
 *   additional_charges|
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

  udf1 = '',
  udf2 = '',
  udf3 = '',
  udf4 = '',
  udf5 = '',

  salt,

  additionalCharges = ''
}) {

  const cleanKey = value(key);
  const cleanTxnid = value(txnid);
  const cleanAmount = value(amount);
  const cleanProductinfo = value(productinfo);
  const cleanFirstname = value(firstname);
  const cleanEmail = value(email);
  const cleanStatus = value(status);

  const cleanUdf1 = value(udf1);
  const cleanUdf2 = value(udf2);
  const cleanUdf3 = value(udf3);
  const cleanUdf4 = value(udf4);
  const cleanUdf5 = value(udf5);

  const cleanSalt = value(salt);
  const cleanAdditionalCharges =
    value(additionalCharges);


  /*
   * Reverse hash common section.
   */
  const reverseParts = [
    cleanSalt,
    cleanStatus,

    '',
    '',
    '',
    '',
    '',
    '',

    cleanUdf5,
    cleanUdf4,
    cleanUdf3,
    cleanUdf2,
    cleanUdf1,

    cleanEmail,
    cleanFirstname,
    cleanProductinfo,
    cleanAmount,
    cleanTxnid,
    cleanKey
  ];


  /*
   * If PayU returned additional_charges,
   * it MUST be the first value.
   */
  if (cleanAdditionalCharges) {

    reverseParts.unshift(
      cleanAdditionalCharges
    );

  }


  const hashString =
    reverseParts.join('|');


  /*
   * Log everything EXCEPT the salt.
   */
  const logString =
    hashString.replace(
      cleanSalt,
      '[SALT_HIDDEN]'
    );

  console.log(
    'PayU response hash input:',
    logString
  );


  return sha512(hashString);
}


/*
 * ============================================================
 * VERIFY PAYU RESPONSE HASH
 * ============================================================
 */

function verifyResponseHash(fields) {

  const salt =
    process.env.PAYU_SALT;

  if (!salt) {

    console.error(
      'PAYU_SALT is missing.'
    );

    return false;
  }


  if (!fields) {

    console.error(
      'PayU response fields are missing.'
    );

    return false;
  }


  const receivedHash =
    value(fields.hash)
      .trim()
      .toLowerCase();


  if (!receivedHash) {

    console.error(
      'PayU response hash is missing.'
    );

    return false;
  }


  /*
   * PayU sometimes returns:
   *
   * additionalCharges
   *
   * and sometimes:
   *
   * additional_charges
   *
   * Support both.
   */
  const additionalCharges =
    fields.additionalCharges ||
    fields.additional_charges ||
    '';


  const calculatedHash =
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

      udf1:
        fields.udf1 || '',

      udf2:
        fields.udf2 || '',

      udf3:
        fields.udf3 || '',

      udf4:
        fields.udf4 || '',

      udf5:
        fields.udf5 || '',

      salt,

      additionalCharges

    });


  console.log(
    'PayU received hash:',
    receivedHash
  );

  console.log(
    'PayU calculated hash:',
    calculatedHash
  );


  const valid =
    hashesMatch(
      receivedHash,
      calculatedHash
    );


  if (!valid) {

    console.error(
      '================================================'
    );

    console.error(
      'PAYU HASH VERIFICATION FAILED'
    );

    console.error(
      `Transaction ID: ${value(fields.txnid)}`
    );

    console.error(
      `Status: ${value(fields.status)}`
    );

    console.error(
      `Amount: ${value(fields.amount)}`
    );

    console.error(
      `Additional Charges: ${value(additionalCharges)}`
    );

    console.error(
      '================================================'
    );

  } else {

    console.log(
      'PayU response hash verified successfully.'
    );

  }


  return valid;
}


/*
 * ============================================================
 * VERIFY TRANSACTION DATA
 * ============================================================
 *
 * Hash verification alone should not be the only check.
 *
 * Compare PayU's txnid and amount with the values that your
 * server stored before redirecting the customer to PayU.
 *
 * ============================================================
 */

function verifyTransactionData({
  payuResponse,
  expectedTxnId,
  expectedAmount
}) {

  if (!payuResponse) {
    return {
      valid: false,
      reason: 'PayU response is missing.'
    };
  }


  const receivedTxnId =
    value(payuResponse.txnid)
      .trim();

  const receivedAmount =
    value(payuResponse.amount)
      .trim();


  const expectedTxn =
    value(expectedTxnId)
      .trim();

  const expectedAmt =
    value(expectedAmount)
      .trim();


  if (!receivedTxnId) {

    return {
      valid: false,
      reason: 'PayU transaction ID is missing.'
    };

  }


  if (!expectedTxn) {

    return {
      valid: false,
      reason: 'Expected transaction ID is missing.'
    };

  }


  if (receivedTxnId !== expectedTxn) {

    console.error(
      'PayU transaction ID mismatch.'
    );

    console.error(
      `Expected: ${expectedTxn}`
    );

    console.error(
      `Received: ${receivedTxnId}`
    );

    return {
      valid: false,
      reason: 'Transaction ID mismatch.'
    };

  }


  /*
   * Compare monetary values safely.
   *
   * Example:
   *
   * 500
   * 500.00
   *
   * should be considered the same amount.
   */
  const receivedAmountNumber =
    Number(receivedAmount);

  const expectedAmountNumber =
    Number(expectedAmt);


  if (
    !Number.isFinite(
      receivedAmountNumber
    ) ||
    !Number.isFinite(
      expectedAmountNumber
    )
  ) {

    return {
      valid: false,
      reason: 'Invalid payment amount.'
    };

  }


  if (
    receivedAmountNumber.toFixed(2) !==
    expectedAmountNumber.toFixed(2)
  ) {

    console.error(
      'PayU amount mismatch.'
    );

    console.error(
      `Expected: ${expectedAmountNumber.toFixed(2)}`
    );

    console.error(
      `Received: ${receivedAmountNumber.toFixed(2)}`
    );

    return {
      valid: false,
      reason: 'Payment amount mismatch.'
    };

  }


  return {
    valid: true,
    reason: 'Transaction data verified.'
  };

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

  verifyResponseHash,

  verifyTransactionData

};
