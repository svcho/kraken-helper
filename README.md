# Kraken helper
Automated savings plan and automatic withdrawal

## Description

These are helper functions which serve to execute bitcoin trades on a specified amount and timeframe and then withdraw the whole balance once every specified timeframe.

By default the functions trade Bitcoin every day for 5 Euro (The current price will be taken and placed as a limit order) and the withdrawal function withdraws all of the bitcoin to a saved wallet.

Both the buy.js file and the withdraw.js file are executed using a cronjob on a linux server.

## Getting Started

### Dependencies

``` 
NodeJS v12.22.5
axios v0.27.2
kraken-api v1.0.1
```

### Installing

* [Node.js](https://nodejs.org/en/download/) can be downloaded from this page or with the package manager of your operating system.

You can install the dependencies by running:

``` 
npm install 
```

### Executing program

In order to automate the purchase and withdrawal cronjobs can be used in Linux (or scheduled tasks in Windows but I will only explain cronjobs under Linux in this file).

You will need to insert your API keys and your slack webhook url into the buy.js and withdraw.js files.

You can setup or edit your cronjobs on your Linux machine using:

``` 
crontab -e 
```

You can now decide how often you want to run the buy.js file or the withdraw.js file. 

Here is an example on how to buy 5 EUR of Bitcoin every day at 22:00 and withdraw your Bitcoin on the 1st every month 00:00 in your crontab file:

``` 
0 22 * * * node /home/svcho/code/kraken-service/buy.js
0 0 1 * * node /home/svcho/code/kraken-service/withdraw.js
```

If you have never used cronjobs you can use [the following website](https://crontab.guru/) to help you create the timeframe you would like to configure.