const axios = require('axios');
const KrakenClient = require('kraken-api');

// Configuration - Ensure these environment variables are set in your Google Cloud Function
const KRAKEN_API_KEY = process.env.KRAKEN_API_KEY;
const KRAKEN_API_SECRET = process.env.KRAKEN_API_SECRET;
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;
const KRAKEN_WALLET_NAME = process.env.KRAKEN_WALLET_NAME; // Key for the pre-configured withdrawal address in Kraken

// Script constants
const BTC_WITHDRAWAL_THRESHOLD = 0.002;
const KRAKEN_ASSET_XBT = 'XBT'; // Kraken's code for Bitcoin
const KRAKEN_BALANCE_FIELD_XXBT = 'XXBT'; // Kraken's field name for Bitcoin balance

// Initialize Kraken client outside of the handler for potential reuse across invocations
let kraken;
if (KRAKEN_API_KEY && KRAKEN_API_SECRET) {
  kraken = new KrakenClient(KRAKEN_API_KEY, KRAKEN_API_SECRET);
} else {
  console.error('CRITICAL: KRAKEN_API_KEY or KRAKEN_API_SECRET environment variables are not set. Kraken client not initialized.');
}

/**
 * Promisified wrapper for Kraken API calls.
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
      if (data && data.error && data.error.length > 0) {
        console.error(`Kraken API returned error in response (${method}):`, data.error);
        return reject(new Error(data.error.join(', ')));
      }
      resolve(data.result);
    });
  });
}

/**
 * Sends a message to a Slack webhook.
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
        text: '`kraken-helper/withdraw.js`: ' + (typeof messageData === 'string' ? messageData : JSON.stringify(messageData)),
      },
      headers: {
        'Content-Type': 'application/json',
      },
    });
    return response.data;
  } catch (error) {
    console.error('Error sending Slack message:', error.response ? error.response.data : error.message);
    return Promise.resolve({ status: 'failed_to_send_slack', error: error.message });
  }
}

/**
 * Gets the account balances from Kraken.
 * @returns {Promise<object>} - A promise that resolves with the account balances.
 */
async function getAccountBalances() {
  return krakenApiRequest('Balance', null);
}

/**
 * Initiates a Bitcoin withdrawal from Kraken.
 * @param {number} amount - The amount of Bitcoin to withdraw.
 * @returns {Promise<object>} - A promise that resolves with the withdrawal API response.
 */
async function initiateBitcoinWithdrawal(amount) {
  if (!KRAKEN_WALLET_NAME) {
    throw new Error('KRAKEN_WALLET_NAME environment variable is not set. Cannot determine withdrawal address key.');
  }
  const withdrawParams = {
    asset: KRAKEN_ASSET_XBT,
    key: KRAKEN_WALLET_NAME, // This is the 'key' (name) of your pre-configured withdrawal address in Kraken
    amount: amount.toFixed(8), // Ensure amount is formatted correctly
  };
  console.log('Initiating Bitcoin withdrawal with params:', withdrawParams);
  return krakenApiRequest('Withdraw', withdrawParams);
}

/**
 * Google Cloud Function HTTP handler for withdrawing Bitcoin.
 * @param {object} req - The HTTP request object.
 * @param {object} res - The HTTP response object.
 */
exports.withdrawBitcoinHandler = async (req, res) => {
  if (!kraken) {
    const errorMessage = 'CRITICAL: Kraken client not initialized. Missing KRAKEN_API_KEY or KRAKEN_API_SECRET.';
    console.error(errorMessage);
    await sendSlackMessage(errorMessage);
    return res.status(500).send({ status: 'error', message: errorMessage });
  }
  if (!KRAKEN_WALLET_NAME) {
    const errorMessage = 'CRITICAL: KRAKEN_WALLET_NAME environment variable is not set. Cannot process withdrawal.';
    console.error(errorMessage);
    await sendSlackMessage(errorMessage);
    return res.status(500).send({ status: 'error', message: errorMessage });
  }

  try {
    console.log('Fetching account balances for withdrawal check...');
    const balances = await getAccountBalances();
    // XXBT is the typical field for Bitcoin balance, but it might be XBT in some contexts. API docs are key.
    // Assuming balances object has keys like 'ZEUR', 'XXBT', etc.
    const btcBalance = parseFloat(balances[KRAKEN_BALANCE_FIELD_XXBT] || '0');
    console.log(`Current Bitcoin balance: ${btcBalance.toFixed(8)} ${KRAKEN_ASSET_XBT}`);

    if (btcBalance >= BTC_WITHDRAWAL_THRESHOLD) { // Use >= to include threshold amount
      console.log(`Balance ${btcBalance.toFixed(8)} BTC is sufficient for withdrawal (threshold: ${BTC_WITHDRAWAL_THRESHOLD} BTC).`);
      // Optionally, withdraw the full available balance or a portion.
      // Current logic withdraws the full btcBalance if it's above threshold.
      // If you want to withdraw only a part, or the threshold amount, adjust 'btcBalance' passed to initiateBitcoinWithdrawal.
      const withdrawalAmount = btcBalance; // Example: withdraw the entire available balance above threshold
      
      const withdrawalResult = await initiateBitcoinWithdrawal(withdrawalAmount);
      const successMessage = `Withdrawal of ${withdrawalAmount.toFixed(8)} ${KRAKEN_ASSET_XBT} initiated successfully. Result: ${JSON.stringify(withdrawalResult)}`;
      console.log(successMessage);
      await sendSlackMessage(successMessage);
      res.status(200).send({ status: 'success', message: successMessage, withdrawalResult });
    } else {
      const insufficientBalanceMessage = `No withdrawal initiated. Bitcoin balance ${btcBalance.toFixed(8)} ${KRAKEN_ASSET_XBT} is below threshold ${BTC_WITHDRAWAL_THRESHOLD} ${KRAKEN_ASSET_XBT}.`;
      console.log(insufficientBalanceMessage);
      await sendSlackMessage(`INFO: ${insufficientBalanceMessage}`);
      res.status(200).send({ status: 'no_action', message: insufficientBalanceMessage });
    }
  } catch (error) {
    const errorMessageString = (error && error.message) ? error.message : 'An unknown error occurred during withdrawal process.';
    const detailedErrorMessage = `Error in withdrawBitcoinHandler: ${errorMessageString}`;
    console.error(detailedErrorMessage, error.stack);
    await sendSlackMessage(`ERROR: ${detailedErrorMessage}`);
    res.status(500).send({ status: 'error', message: detailedErrorMessage });
  }
};