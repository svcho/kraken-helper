const axios = require('axios');
const KrakenClient = require('kraken-api');
const key = "INSERT_YOUR_API_KEY";
const secret = "INSERT_YOUR_API_SECRET";
const slack_web_hook = "INSERT_YOUR_SLACK_WEBHOOK";
const wallet_name = "INSERT_YOUR_KRAKEN_WALLET_NAME";
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