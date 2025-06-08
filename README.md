# Kraken Helper - Google Cloud Run Edition

Automated Bitcoin savings plan and withdrawal using Kraken, designed for Google Cloud Run.

## Description

This project contains a Node.js application that provides two main functionalities, packaged for deployment on Google Cloud Run:

*   **Buy Bitcoin**: An endpoint (`/buy`) that buys a predefined amount of Bitcoin (default: 5 EUR) on Kraken. It fetches the current price, calculates the volume, checks your EUR balance, and places a limit order.
*   **Withdraw Bitcoin**: An endpoint (`/withdraw`) that withdraws Bitcoin from your Kraken account to a pre-configured withdrawal address if the balance exceeds a certain threshold (default: 0.002 BTC).

Both actions send notifications to a Slack webhook. The application is designed to be triggered via HTTP POST requests to these endpoints and can be scheduled using Google Cloud Scheduler.

## Getting Started

### Prerequisites

*   **Node.js**: (v18+ recommended, as used in `Dockerfile`). Download from [nodejs.org](https://nodejs.org/en/download/).
*   **npm**: (Node Package Manager, comes with Node.js).
*   **Docker**: Install Docker Desktop or Docker Engine. Follow the [official Docker installation guide](https://docs.docker.com/get-docker/).
*   **Google Cloud SDK (gcloud CLI)**: Install and initialize it. Follow the [official Google Cloud SDK installation guide](https://cloud.google.com/sdk/docs/install). Ensure it's configured for your project.
*   **Google Cloud Project**: You'll need a Google Cloud Project with billing enabled. Note the Project ID.
    *   Enable the **Cloud Run API** and **Artifact Registry API** (or Google Container Registry API).
*   **Kraken Account**: With API keys (key and secret) generated. Ensure the API key has permissions for:
    *   Querying account balance
    *   Querying ticker information
    *   Creating buy/sell orders
    *   Querying withdrawal information
    *   Initiating withdrawals (for `/withdraw` endpoint)
*   **Kraken Withdrawal Address Key**: For the `/withdraw` endpoint, you need to have a withdrawal address pre-configured in your Kraken account and know its 'key' or 'name'.
*   **Slack Webhook URL**: For receiving notifications.

### Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/your-username/kraken-helper.git # Replace with your repo URL if forked
    cd kraken-helper
    ```

2.  **Install dependencies (for local development/testing):**
    ```bash
    npm install
    ```
    This will install `express`, `axios`, `dotenv`, and `kraken-api` as defined in `package.json`. Dependencies for deployment are handled within the Docker build.

3.  **(Optional) Create a `.env` file for local development:**
    Copy `.env.example` (if provided) or create a new `.env` file in the root directory with your credentials for local testing:
    ```env
    KRAKEN_API_KEY="YOUR_KRAKEN_API_KEY"
    KRAKEN_API_SECRET="YOUR_KRAKEN_API_SECRET"
    SLACK_WEBHOOK_URL="YOUR_SLACK_WEBHOOK_URL"
    KRAKEN_WALLET_NAME="YOUR_KRAKEN_WALLET_KEY_NAME" # Only if testing withdraw
    # PORT=8080 # Optional for local development, defaults to 8080. Cloud Run provides its own PORT variable.
    ```
    **Important:** Do not commit your `.env` file to Git. It's included in `.gitignore`.

## Configuration (Environment Variables for Cloud Run)

The application is configured using environment variables. **Do not hardcode your credentials.**

When deploying to Google Cloud Run, you will set these variables in the service's configuration.

**Required for both endpoints:**
*   `KRAKEN_API_KEY`: Your Kraken API Key.
*   `KRAKEN_API_SECRET`: Your Kraken API Secret.
*   `SLACK_WEBHOOK_URL`: Your Slack incoming webhook URL.

**Required only for the `/withdraw` endpoint:**
*   `KRAKEN_WALLET_NAME`: The 'key' or 'name' of your pre-configured withdrawal address in your Kraken account settings.

**Security Note:** For enhanced security, consider using Google Secret Manager to store your sensitive credentials and grant your Cloud Run service's service account access to these secrets.

## Deployment to Google Cloud Run

Deployment involves building a Docker container image, pushing it to a container registry (like Google Artifact Registry or Google Container Registry), and then deploying it as a Cloud Run service.

Replace `YOUR_PROJECT_ID`, `YOUR_REGION` (e.g., `us-central1`), `SERVICE_NAME` (e.g., `kraken-helper`), and `IMAGE_NAME` with your actual details.

### 1. Build the Docker Image

From the root of the `kraken-helper` directory. If you are on an Apple Silicon (M-series) Mac or another non-amd64 architecture, specify the platform:
```bash
docker build --platform linux/amd64 -t gcr.io/YOUR_PROJECT_ID/IMAGE_NAME:latest .
# Or for Artifact Registry:
# docker build --platform linux/amd64 -t YOUR_REGION-docker.pkg.dev/YOUR_PROJECT_ID/YOUR_REPO_NAME/IMAGE_NAME:latest .
```
Example: `docker build --platform linux/amd64 -t gcr.io/my-gcp-project/kraken-app:latest .`

### 2. Push the Image to a Registry

**Using Google Container Registry (GCR):**
```bash
gcloud auth configure-docker
docker push gcr.io/YOUR_PROJECT_ID/IMAGE_NAME:latest
```

**Using Google Artifact Registry:**
(Ensure you have an Artifact Registry Docker repository created)
```bash
gcloud auth configure-docker YOUR_REGION-docker.pkg.dev
docker push YOUR_REGION-docker.pkg.dev/YOUR_PROJECT_ID/YOUR_REPO_NAME/IMAGE_NAME:latest
```

### 3. Deploy to Cloud Run

Deploy the image to Cloud Run, ensuring it requires authentication. Cloud Run automatically sets the `PORT` environment variable; do not set it manually here.

```bash
gcloud run deploy SERVICE_NAME \
  --image gcr.io/YOUR_PROJECT_ID/IMAGE_NAME:latest \
  # Or for Artifact Registry: --image YOUR_REGION-docker.pkg.dev/YOUR_PROJECT_ID/YOUR_REPO_NAME/IMAGE_NAME:latest \
  --platform managed \
  --region YOUR_REGION \
  --set-env-vars KRAKEN_API_KEY="YOUR_KRAKEN_API_KEY",KRAKEN_API_SECRET="YOUR_KRAKEN_API_SECRET",SLACK_WEBHOOK_URL="YOUR_SLACK_WEBHOOK_URL",KRAKEN_WALLET_NAME="YOUR_KRAKEN_WALLET_KEY_NAME" \
  --no-allow-unauthenticated
```
*   `--no-allow-unauthenticated`: This is crucial. It ensures your Cloud Run service is private and requires IAM authentication for invocation. This is recommended for secure, automated tasks.
*   After deployment, Cloud Run will provide a service URL. This URL will be private.

## Scheduling with Google Cloud Scheduler

To automate the execution of the buy and withdraw actions, use Google Cloud Scheduler to send authenticated HTTP POST requests to your private Cloud Run service endpoints.

### 1. Create a Service Account for Cloud Scheduler

This service account will be used by Cloud Scheduler to invoke your Cloud Run service.
```bash
gcloud iam service-accounts create SCHEDULER_INVOKER_NAME 
  --display-name="Service Account for Cloud Scheduler Invocation"
```
Replace `SCHEDULER_INVOKER_NAME` (e.g., `kraken-scheduler-invoker`). Note the full email of the created service account (e.g., `SCHEDULER_INVOKER_NAME@YOUR_PROJECT_ID.iam.gserviceaccount.com`).

### 2. Grant Service Account Invoker Permissions

Allow the new service account to invoke your Cloud Run service.
```bash
gcloud run services add-iam-policy-binding SERVICE_NAME \
  --member="serviceAccount:SCHEDULER_INVOKER_EMAIL" \
  --role="roles/run.invoker" \
  --region=YOUR_REGION \
  --platform=managed
```
Replace `SERVICE_NAME`, `SCHEDULER_INVOKER_EMAIL`, and `YOUR_REGION`.

### 3. Create Cloud Scheduler Jobs

Create a job for each endpoint (`/buy` and `/withdraw`).

**Example for `/buy` job (e.g., every 2 days at 08:00 UTC):**
```bash
gcloud scheduler jobs create http YOUR_BUY_JOB_NAME \
  --schedule="0 8 */2 * *" \
  --uri="YOUR_CLOUD_RUN_SERVICE_URL/buy" \
  --http-method=POST \
  --message-body="{}" \
  --oidc-service-account-email="SCHEDULER_INVOKER_EMAIL" \
  --location=YOUR_SCHEDULER_REGION \
  --description="Trigger Kraken Bitcoin buy operation"
```

**Example for `/withdraw` job (e.g., 1st of month at 10:00 UTC):**
```bash
gcloud scheduler jobs create http YOUR_WITHDRAW_JOB_NAME \
  --schedule="0 10 1 * *" \
  --uri="YOUR_CLOUD_RUN_SERVICE_URL/withdraw" \
  --http-method=POST \
  --message-body="{}" \
  --oidc-service-account-email="SCHEDULER_INVOKER_EMAIL" \
  --location=YOUR_SCHEDULER_REGION \
  --description="Trigger Kraken Bitcoin withdrawal check"
```
*   Replace placeholders like `YOUR_BUY_JOB_NAME`, `YOUR_CLOUD_RUN_SERVICE_URL`, `SCHEDULER_INVOKER_EMAIL`, and `YOUR_SCHEDULER_REGION`.
*   The `--message-body="{}"` sends an empty JSON object, which might be required by some setups.
*   The `--oidc-service-account-email` ensures the job authenticates correctly to your private Cloud Run service.
*   Schedules are in UTC by default. Use `--time-zone` to specify a different one if needed.
*   You can use [crontab.guru](https://crontab.guru/) to help create your cron expressions.

## Local Development & Testing

1.  Ensure you have a `.env` file with your credentials.
2.  Run the server locally:
    ```bash
    npm start
    ```
    The server will start, typically on `http://localhost:8080`.
3.  You can then use tools like `curl` or Postman to send POST requests to your local endpoints:
    *   `curl -X POST http://localhost:8080/buy`
    *   `curl -X POST http://localhost:8080/withdraw`

Check the console output for logs and Slack for notifications.