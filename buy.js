const axios = require('axios');
const KrakenClient = require('kraken-api');

// Configuration
const config = {
  apiKey: "INSERT_YOUR_API_KEY",
  apiSecret: "INSERT_YOUR_API_SECRET",
  slackWebhook: "INSERT_YOUR_SLACK_WEBHOOK"
};

const kraken = new KrakenClient(config.apiKey, config.apiSecret);

// Entry point
main();

// Main function
async function main() {
  // Define the desired amount to spend in Euros
  const EUR_BUY_AMOUNT = 5.00;

  // Get the current Bitcoin price in Euros
  let price = parseFloat(await getCurrentBitcoinPrice()).toFixed(2);

  // Calculate the volume of Bitcoin to buy based on the desired amount and current price
  let volume = parseFloat(EUR_BUY_AMOUNT / price).toFixed(8);

  // Get the account balances
  let balances = await getAccountBalances();

  // Place a limit order to buy Bitcoin and send a Slack message with the result
  try {
    await placeLimitOrder(price, volume, balances);
    await sendSlackMessage('Order placed successfully.');
  } catch (error) {
    await sendSlackMessage(`Error: ${error}`);
  }
}

// Get the current Bitcoin price in Euros
function getCurrentBitcoinPrice() {
  return new Promise((resolve, reject) => {
    kraken.api('Ticker', { "pair": 'BTCEUR' }, function (error, data) {
      if (error) {
        reject(error);
      } else {
        // Extract the current price and add 20 as a buffer
        const price = parseFloat(data.result['XXBTZEUR']['a'][0]);
        resolve(price + 20);
      }
    });
  });
}

// Get the account balances
function getAccountBalances() {
  return new Promise((resolve, reject) => {
    kraken.api('Balance', null, function (error, data) {
      if (error) {
        reject(error);
      } else {
        resolve(data.result);
      }
    });
  });
}

// Place a limit order to buy Bitcoin
function placeLimitOrder(price, volume, balances) {
  let euroBalance = balances['ZEUR'];

  if (euroBalance < price * volume) {
    if (euroBalance > 4) {
      volume = parseFloat(euroBalance / price).toFixed(8);
    } else {
      throw new Error(`Insufficient fiat for transaction error. Tried to buy ${volume} BTC for ${price} EUR`);
    }
  }

  const limitOrder = {
    'pair': 'BTCEUR',
    'type': 'buy',
    'ordertype': 'limit',
    'price': price,
    'volume': volume
  };

  return new Promise((resolve, reject) => {
    kraken.api('AddOrder', limitOrder, function (error, data) {
      if (error) {
        reject(error);
      } else {
        resolve(data.result);
      }
    });
  });
}

// Send a Slack message with the provided data
function sendSlackMessage(data) {
  return new Promise((resolve, reject) => {
    axios({
      method: 'POST',
      url: config.slackWebhook,
      data: {
        "type": "mrkdwn",
        'text': '`' + JSON.stringify(data) + '`'
      },
      headers: {
        'Content-Type': 'application/json'
      }
    })
      .then(function (response) {
        resolve(response);
      })
      .catch(function (response) {
        reject(response);
      });
  });
}