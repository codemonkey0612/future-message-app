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

## Deployment

Deploy all functions:
```bash
firebase deploy --only functions
```

Deploy a specific function:
```bash
firebase deploy --only functions:exchangeLineToken
```

## Local Development

Run functions locally:
```bash
npm run serve
```

This will start the Firebase emulator for functions.

