require('dotenv').config();
const axios = require('axios');
const KrakenClient = require('kraken-api');
const key = process.env.API_KEY;
const secret = process.env.API_SECRET;
const slack_web_hook = process.env.SLACK_WITHDRAWAL_WEB_HOOK;
const wallet_name = process.env.WALLET_NAME;
const kraken = new KrakenClient(key, secret);

main();

async function main() {
    let balances = await kraken.api('Balance');
    let btc_balance = parseFloat(balances.result.XXBT);
    if(btc_balance > 0.002){
        await kraken.api('Withdraw', { asset : 'XBT', key: wallet_name, amount: btc_balance }).then(sendSlackMessage, sendSlackMessage);
    }else{
        sendSlackMessage("No withdrawal initiated. insufficient balance")
    }
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