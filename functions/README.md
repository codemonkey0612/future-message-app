# Firebase Functions

This directory contains Firebase Cloud Functions for secure server-side operations.

## Setup

1. Install dependencies:
```bash
cd functions
npm install
```

2. Build TypeScript:
```bash
npm run build
```

## Available Functions

### `exchangeLineToken`
Securely exchanges LINE OAuth authorization code for access token. This keeps the LINE Channel Secret secure on the server.

**Parameters:**
- `code`: LINE OAuth authorization code
- `redirectUri`: The redirect URI used in the OAuth flow
- `campaignId`: The campaign ID to retrieve LINE credentials

**Returns:**
- `lineUserId`: The LINE user ID extracted from the token
- `success`: Boolean indicating success

### `sendEmailMessage`
Sends email message to user based on submission and campaign configuration.

**Parameters:**
- `submissionId`: The submission ID to send
- `campaignId`: The campaign ID

**Returns:**
- `success`: Boolean indicating success
- `message`: Status message

### `sendLineMessage`
Sends LINE message to user based on submission and campaign configuration.

**Parameters:**
- `submissionId`: The submission ID to send
- `campaignId`: The campaign ID

**Returns:**
- `success`: Boolean indicating success
- `message`: Status message

### `processScheduledDeliveries`
Scheduled function that runs every hour to process pending message deliveries. Automatically checks for messages that need to be delivered based on campaign delivery settings (datetime or interval).

**Note:** This is a scheduled function and doesn't need to be called manually.

## Deployment

Deploy all functions:
```bash
firebase deploy --only functions
```

Deploy a specific function:
```bash
firebase deploy --only functions:exchangeLineToken
```

## Configuration

### Email Configuration

Set up email credentials for sending emails:

```bash
firebase functions:config:set email.user="your-email@gmail.com" email.password="your-app-password"
```

Or use environment variables in your `.env` file (for local development).

**Note:** For Gmail, you need to:
1. Enable 2-factor authentication
2. Generate an App Password (not your regular password)
3. Use the App Password in the configuration

### LINE Configuration

LINE credentials are stored in Firestore campaigns. Make sure each campaign has:
- `lineChannelId`
- `lineChannelSecret`

## Local Development

Run functions locally:
```bash
npm run serve
```

This will start the Firebase emulator for functions.

## Testing Functions

You can test functions using the Firebase console or by calling them from your frontend:

```typescript
import { functions } from './services/firebase';

// Send email manually
const sendEmail = functions.httpsCallable('sendEmailMessage');
await sendEmail({ submissionId: 'xxx', campaignId: 'yyy' });

// Send LINE message manually
const sendLine = functions.httpsCallable('sendLineMessage');
await sendLine({ submissionId: 'xxx', campaignId: 'yyy' });
```

