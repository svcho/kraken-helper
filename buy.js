const axios = require('axios');
const KrakenClient = require('kraken-api');

// Configuration - Ensure these environment variables are set in your Google Cloud Function
const KRAKEN_API_KEY = process.env.KRAKEN_API_KEY;
const KRAKEN_API_SECRET = process.env.KRAKEN_API_SECRET;
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;

// Script constants
const DEFAULT_EUR_BUY_AMOUNT = 5.00;
const KRAKEN_PAIR_BTCEUR = 'XXBTZEUR';
const PRICE_BUFFER = 20.00; // Buffer added to the current ask price for the limit order
const MIN_EUR_BALANCE_FOR_ADJUSTMENT = 4.00;

// Initialize Kraken client outside of the handler for potential reuse across invocations
let kraken;
if (KRAKEN_API_KEY && KRAKEN_API_SECRET) {
  kraken = new KrakenClient(KRAKEN_API_KEY, KRAKEN_API_SECRET);
} else {
  console.error('CRITICAL: KRAKEN_API_KEY or KRAKEN_API_SECRET environment variables are not set. Kraken client not initialized.');
  // The handler function will fail if kraken is not initialized.
}

/**
 * Promisified wrapper for Kraken API calls.
 * @param {string} method - The API method name (e.g., 'Ticker', 'Balance', 'AddOrder').
 * @param {object} params - The parameters for the API call.
 * @returns {Promise<object>} - A promise that resolves with the API response data.
 */
function krakenApiRequest(method, params) {
  return new Promise((resolve, reject) => {
    if (!kraken) {
      return reject(new Error('Kraken client is not initialized due to missing API key/secret.'));
    }
    kraken.api(method, params, (error, data) => {
      if (error) {
        console.error(`Kraken API Error (${method}):`, error);
        return reject(error);
      }
      // Kraken API sometimes returns errors in the 'error' array within the data object
      if (data && data.error && data.error.length > 0) {
        console.error(`Kraken API returned error in response (${method}):`, data.error);
        return reject(new Error(data.error.join(', '))); // Join multiple error messages if any
      }
      resolve(data.result); // Successful API calls usually have results in data.result
    });
  });
}

/**
 * Sends a message to a Slack webhook.
 * @param {string | object} messageData - The data to send to Slack.
 * @returns {Promise<object>} - A promise that resolves with the Slack API response or status.
 */
async function sendSlackMessage(messageData) {
  if (!SLACK_WEBHOOK_URL) {
    console.warn('SLACK_WEBHOOK_URL not set. Skipping Slack notification.');
    return Promise.resolve({ status: 'skipped', reason: 'SLACK_WEBHOOK_URL not set' });
  }
  try {
    const response = await axios({
      method: 'POST',
      url: SLACK_WEBHOOK_URL,
      data: {
        type: 'mrkdwn',
        text: '`kraken-helper/buy.js`: ' + (typeof messageData === 'string' ? messageData : JSON.stringify(messageData)),
      },
      headers: {
        'Content-Type': 'application/json',
      },
    });
    return response.data; // Return Slack's response data
  } catch (error) {
    console.error('Error sending Slack message:', error.response ? error.response.data : error.message);
    // Don't let Slack failure stop the main flow, but log it and resolve
    return Promise.resolve({ status: 'failed_to_send_slack', error: error.message }); 
  }
}

/**
 * Gets the current Bitcoin price in Euros from Kraken.
 * @returns {Promise<number>} - A promise that resolves with the current Bitcoin price + buffer.
 */
async function getCurrentBitcoinPrice() {
  const data = await krakenApiRequest('Ticker', { pair: KRAKEN_PAIR_BTCEUR });
  console.log('Data received from Ticker API:', JSON.stringify(data, null, 2)); // Added logging
  // 'a' array in ticker response contains [ask_price, ask_whole_lot_volume, ask_lot_volume]
  const price = parseFloat(data[KRAKEN_PAIR_BTCEUR]['a'][0]);
  return price + PRICE_BUFFER;
}

/**
 * Gets the account balances from Kraken.
 * @returns {Promise<object>} - A promise that resolves with the account balances.
 */
async function getAccountBalances() {
  return krakenApiRequest('Balance', null);
}

/**
 * Places a limit order to buy Bitcoin.
 * @param {number} price - The price at which to buy.
 * @param {number} initialVolume - The initial volume of Bitcoin to buy.
 * @param {object} balances - The current account balances.
 * @returns {Promise<object>} - A promise that resolves with the order placement result.
 */
async function placeLimitOrder(price, initialVolume, balances) {
  let volumeToBuy = initialVolume;
  const euroBalance = parseFloat(balances['ZEUR'] || '0'); // Default to '0' if ZEUR is not present

  if (euroBalance < price * volumeToBuy) {
    if (euroBalance >= MIN_EUR_BALANCE_FOR_ADJUSTMENT) {
      volumeToBuy = parseFloat((euroBalance / price).toFixed(8));
      const adjustmentMessage = `INFO: Insufficient EUR for initial target (${(price * initialVolume).toFixed(2)} EUR). Adjusted buy volume to ${volumeToBuy} BTC based on ${euroBalance.toFixed(2)} EUR balance.`;
      console.log(adjustmentMessage);
      await sendSlackMessage(adjustmentMessage); // Send Slack message about adjustment
    } else {
      throw new Error(`Insufficient fiat for transaction. Tried to buy ${initialVolume.toFixed(8)} BTC at ${price.toFixed(2)} EUR/BTC (Total: ${(price * initialVolume).toFixed(2)} EUR). Available EUR: ${euroBalance.toFixed(2)}. Minimum for adjustment: ${MIN_EUR_BALANCE_FOR_ADJUSTMENT.toFixed(2)} EUR.`);
    }
  }
  
  if (volumeToBuy <= 0) {
    throw new Error(`Calculated volume to buy is ${volumeToBuy.toFixed(8)}, which is not positive. Purchase cannot proceed.`);
  }

  const limitOrderParams = {
    pair: KRAKEN_PAIR_BTCEUR,
    type: 'buy',
    ordertype: 'limit',
    price: price.toFixed(2), // Ensure price is formatted to 2 decimal places for the order
    volume: volumeToBuy.toFixed(8),
    // validate: true // Useful for testing: if true, order is validated but not executed.
  };

  console.log('Placing limit order with params:', limitOrderParams);
  return krakenApiRequest('AddOrder', limitOrderParams);
}

/**
 * Google Cloud Function HTTP handler for buying Bitcoin.
 * @param {object} req - The HTTP request object (from Google Cloud Functions).
 * @param {object} res - The HTTP response object (from Google Cloud Functions).
 */
exports.buyBitcoinHandler = async (req, res) => {
  // Check for Kraken client initialization (dependent on env vars)
  if (!kraken) {
    const errorMessage = 'CRITICAL: Kraken client not initialized. Missing KRAKEN_API_KEY or KRAKEN_API_SECRET in environment variables.';
    console.error(errorMessage);
    // Attempt to send Slack message even if client init failed, as SLACK_WEBHOOK_URL might be set
    await sendSlackMessage(errorMessage);
    return res.status(500).send({ status: 'error', message: errorMessage });
  }

  // For future use, you could get this from req.body or req.query if the function is called with parameters
  // const eurBuyAmount = (req.body && req.body.eurAmount) ? parseFloat(req.body.eurAmount) : DEFAULT_EUR_BUY_AMOUNT;
  const eurBuyAmount = DEFAULT_EUR_BUY_AMOUNT; // Using the defined constant for now

  try {
    console.log(`Attempting to buy approximately ${eurBuyAmount.toFixed(2)} EUR of Bitcoin.`);
    
    const currentPriceWithBuffer = parseFloat((await getCurrentBitcoinPrice()).toFixed(2));
    console.log(`Current effective BTCEUR price (including ${PRICE_BUFFER.toFixed(2)} EUR buffer): ${currentPriceWithBuffer}`);

    let initialVolume = parseFloat((eurBuyAmount / currentPriceWithBuffer).toFixed(8));
    if (initialVolume <= 0) {
        throw new Error(`Initial calculated volume (${initialVolume.toFixed(8)}) is not positive. This might be due to a very high price or low buy amount.`);
    }
    console.log(`Initial calculated volume: ${initialVolume.toFixed(8)} BTC`);

    const balances = await getAccountBalances();
    console.log('Fetched account balances.'); // Avoid logging full balance object for security/privacy

    const orderResult = await placeLimitOrder(currentPriceWithBuffer, initialVolume, balances);
    const successMessage = `Buy order placed successfully. Order Details: ${JSON.stringify(orderResult)}`;
    console.log(successMessage);
    await sendSlackMessage(successMessage);
    res.status(200).send({ status: 'success', message: successMessage, orderResult });

  } catch (error) {
    // Ensure error.message is a string, default to generic message if not
    const errorMessageString = (error && error.message) ? error.message : 'An unknown error occurred.';
    const detailedErrorMessage = `Error in buyBitcoinHandler: ${errorMessageString}`;
    console.error(detailedErrorMessage, error.stack); // Log stack for debugging
    await sendSlackMessage(`ERROR: ${detailedErrorMessage}`);
    res.status(500).send({ status: 'error', message: detailedErrorMessage });
  }
};