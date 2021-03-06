const axios = require('axios');
const KrakenClient = require('kraken-api');
const key = "INSERT_YOUR_API_KEY";
const secret = "INSERT_YOUR_API_SECRET";
const slack_web_hook = "INSERT_YOUR_SLACK_WEBHOOK";
const kraken = new KrakenClient(key, secret);

main();

async function main() {

    const EUR_BUY_AMOUNT = 5.00; //change to whatever value you want
    let price = parseFloat(await getCurrentBitcoinPrice()).toFixed(2);
    let volume = parseFloat(EUR_BUY_AMOUNT / price).toFixed(8);
    let balances = await kraken.api('Balance');

    await placeLimitOrder(price, volume, balances).then(sendSlackMessage, sendSlackMessage);
}

function getCurrentBitcoinPrice() {
    return new Promise((resolve, reject) => {
        kraken.api('Ticker', { "pair": 'BTCEUR' }, function (error, data) {
            if (error) {
                reject(error);
            }
            else {
                resolve(data.result['XXBTZEUR']['a'][0] + 20);
            }
        });
    });
}

function placeLimitOrder(price, volume, balances) {
    return new Promise((resolve, reject) => {

        let euroBalance = balances['result']['ZEUR']

        if (euroBalance < price * volume) {
            if (euroBalance > 4) {
                volume = parseFloat(euroBalance / price).toFixed(8);
            } else {
                reject('Insufficient fiat for transaction error. Tried to buy ' + volume + ' BTC for' + price + ' EUR');
            }
        }

        var limitOrder = {
            'pair': 'BTCEUR',
            'type': 'buy',
            'ordertype': 'limit',
            'price': price,
            'volume': volume
        };

        kraken.api('AddOrder', limitOrder, function (error, data) {
            if (error) {
                reject(error)
            }
            else {
                resolve(data.result);
            }
        });
    });
}

function sendSlackMessage(data) {
    return new Promise((resolve, reject) => {
        axios({
            method: 'POST',
            url: slack_web_hook,
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