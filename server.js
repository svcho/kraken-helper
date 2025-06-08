// Load environment variables from .env file for local development
// In Cloud Run, environment variables are set in the service configuration.
// dotenv is already a dependency in your package.json.
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

const express = require('express');
// Assuming buyBitcoinHandler is exported from buy.js
const { buyBitcoinHandler } = require('./buy.js');
// Assuming withdrawBitcoinHandler is exported from withdraw.js
const { withdrawBitcoinHandler } = require('./withdraw.js');

const app = express();
const port = process.env.PORT || 8080; // Cloud Run provides PORT env variable

// Middleware to parse JSON bodies (useful if you later send parameters in request body)
app.use(express.json());

// A simple root route to check if the service is running
app.get('/', (req, res) => {
  res.status(200).send('Kraken Helper service is running and ready.');
});

// Route for buying Bitcoin
// Using POST as it's an action. Cloud Scheduler can be configured to send POST.
app.post('/buy', async (req, res) => {
  console.log('Received POST request to /buy endpoint.');
  try {
    // The existing handlers are designed for (req, res) and should work directly.
    await buyBitcoinHandler(req, res);
  } catch (error) {
    // Fallback error handling in case the handler itself doesn't catch/send response
    console.error('Unhandled error in /buy route:', error);
    if (!res.headersSent) {
      res.status(500).send({ status: 'error', message: 'An unexpected error occurred in the buy endpoint.' });
    }
  }
});

// Route for withdrawing Bitcoin
// Using POST as it's an action.
app.post('/withdraw', async (req, res) => {
  console.log('Received POST request to /withdraw endpoint.');
  try {
    await withdrawBitcoinHandler(req, res);
  } catch (error) {
    // Fallback error handling
    console.error('Unhandled error in /withdraw route:', error);
    if (!res.headersSent) {
      res.status(500).send({ status: 'error', message: 'An unexpected error occurred in the withdraw endpoint.' });
    }
  }
});

app.listen(port, () => {
  console.log(`Kraken Helper service listening on port ${port}`);
  console.log('Available endpoints:');
  console.log(`  POST /buy`);
  console.log(`  POST /withdraw`);
  console.log(`  GET  / (status check)`);
});

// Export the app for potential testing or other uses (optional)
module.exports = app;
