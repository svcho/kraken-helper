const axios = require('axios');
const KrakenClient = require('kraken-api');

// Configuration
const config = {
  apiKey: "INSERT_YOUR_API_KEY",
  apiSecret: "INSERT_YOUR_API_SECRET",
  slackWebhook: "INSERT_YOUR_SLACK_WEBHOOK",
  walletName: "INSERT_YOUR_KRAKEN_WALLET_NAME"
};

const kraken = new KrakenClient(config.apiKey, config.apiSecret);

// Entry point
main();

// Main function
async function main() {
  // Get the account balances
  let balances = await getAccountBalances();

  // Get the Bitcoin balance
  let btcBalance = parseFloat(balances.result.XXBT);

  // Check if the balance is above the threshold for withdrawal
  if (btcBalance > 0.002) {
    // Initiate the Bitcoin withdrawal to the specified wallet
    try {
      await withdrawBitcoin(btcBalance);
      await sendSlackMessage('Withdrawal initiated successfully.');
    } catch (error) {
      await sendSlackMessage(`Error: ${error}`);
    }
  } else {
    await sendSlackMessage('No withdrawal initiated. Insufficient balance.');
  }
}

// Get the account balances
function getAccountBalances() {
  return kraken.api('Balance');
}

// Initiate a Bitcoin withdrawal
function withdrawBitcoin(amount) {
  const withdrawParams = {
    asset: 'XBT',
    key: config.walletName,
    amount: amount
  };

  return kraken.api('Withdraw', withdrawParams);
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