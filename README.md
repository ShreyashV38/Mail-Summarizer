# Mail Summarizer

Mail Summarizer is an automated Google Apps Script application that triages incoming emails using the Gemini API. It classifies emails as either urgent or normal, summarizes them, and delivers notifications via Telegram. Urgent emails are sent immediately, while normal emails are queued and sent as a daily digest.

## Features

- Scans unread emails automatically every 5 minutes.
- Uses Google Gemini API to classify emails (Urgent vs. Normal) and generate brief summaries.
- Integrates with a Telegram Bot to deliver instant notifications for urgent emails.
- Compiles normal emails into a daily digest sent at a specified hour (default is 8 PM).
- Allows on-demand interaction via Telegram commands (`/whatsup`, `/status`, `/help`).

## Prerequisites

1. A Google Account.
2. A Telegram account to create a bot and receive messages.
3. A Google Gemini API Key.

## Setup Instructions

### 1. Create the Telegram Bot
1. Open Telegram and search for the `BotFather`.
2. Send the `/newbot` command and follow the prompts to create your bot.
3. Copy the HTTP API Token provided by BotFather.
4. Start a chat with your new bot and send a message.
5. Retrieve your Chat ID (you can use bots like `userinfobot` to find your Telegram Chat ID).

### 2. Configure the Google Apps Script
1. Go to [Google Apps Script](https://script.google.com/) and create a new project.
2. Copy the contents of `Code.js` and `appsscript.json` from this repository into your new Apps Script project.
3. Update the configuration variables at the top of `Code.js` with your credentials:
   - `GEMINI_API_KEY`: Your Google Gemini API Key.
   - `TELEGRAM_BOT_TOKEN`: The token provided by BotFather.
   - `TELEGRAM_CHAT_ID`: Your personal Telegram Chat ID.
   - `DIGEST_HOUR`: The hour (0-23) you wish to receive the daily digest (default is 20 for 8 PM).

### 3. Deploy as a Web App
1. In the Apps Script editor, click **Deploy** > **New deployment**.
2. Select **Web app** as the deployment type.
3. Set **Execute as** to `Me`.
4. Set **Who has access** to `Anyone`.
5. Click **Deploy** and authorize the necessary permissions when prompted.
6. Copy the generated Web App URL.
7. Paste this URL into the `WEBAPP_URL` variable at the top of `Code.js`.

### 4. Initialize the System
1. In the Apps Script editor, select the `setupTriggers` function from the dropdown menu in the toolbar and click **Run**. This will configure the necessary time-based triggers.
2. Select the `setWebhook` function from the dropdown menu and click **Run**. This connects your Telegram bot to the deployed Web App to handle commands.

## Usage

Once setup is complete, the script operates automatically:
- **Every 5 Minutes**: Checks for new unread emails. Urgent emails are summarized and sent instantly via Telegram. Normal emails are queued.
- **Daily**: Sends a digest of all queued normal emails at the configured `DIGEST_HOUR`.

### Telegram Commands
You can interact with your bot by sending the following commands in Telegram:
- `/whatsup` - Instantly sends the current queue of normal emails without waiting for the daily digest.
- `/status` - Checks the operational status of the script and the size of the current queue.
- `/help` - Lists available commands.

## Maintenance

If you need to reset the system state (e.g., clear the queue and mark existing unread emails as processed without triggering summaries), run the `resetScript()` function from the Apps Script editor.
