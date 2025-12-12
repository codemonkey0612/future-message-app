# How LINE Messaging Works

This document explains the complete flow of how LINE messages are sent in this application.

## Overview

The LINE messaging system uses LINE's OAuth 2.0 and Messaging API to send messages to users. The process involves:
1. User authorization via LINE OAuth
2. Obtaining LINE User ID
3. Storing submission with LINE User ID
4. Sending messages at scheduled time using LINE Messaging API

## Complete Flow

### Step 1: User Initiates LINE Delivery

**Location**: `pages/client/MessageForm.tsx`

When a user selects LINE delivery and submits the form:

```typescript
const initiateLineAuth = () => {
  // 1. Store submission data temporarily in sessionStorage
  const submissionData = {
    campaignId: campaign.id,
    submittedAt: new Date().toISOString(),
    deliveryChoice: 'line',
    formData: sanitizedFormData,
    surveyAnswers: {}, // Will be filled after auth
  };
  
  // 2. Store in sessionStorage for later retrieval
  sessionStorage.setItem('pendingSubmission', JSON.stringify(submissionData));
  
  // 3. Redirect to LINE OAuth authorization page
  const lineAuthUrl = `https://access.line.me/oauth2/v2.1/authorize?
    response_type=code&
    client_id=${campaign.lineChannelId}&
    redirect_uri=${encodeURIComponent(redirectUri)}&
    state=${state}&
    scope=profile%20openid`;
  
  window.location.href = lineAuthUrl;
};
```

**What happens:**
- Submission data is stored in `sessionStorage` (not yet saved to Firestore)
- User is redirected to LINE's authorization page
- User authorizes the app to access their LINE profile

### Step 2: LINE OAuth Callback

**Location**: `pages/line/LineCallback.tsx`

After user authorizes, LINE redirects back to `/line/callback` with an authorization code:

```typescript
// 1. Extract authorization code from URL
const params = new URLSearchParams(location.search);
const code = params.get('code');
const state = params.get('state');

// 2. Retrieve pending submission from sessionStorage
const pendingSubmission = JSON.parse(sessionStorage.getItem('pendingSubmission'));

// 3. Call Firebase Function to exchange code for LINE User ID
const exchangeLineToken = functions.httpsCallable('exchangeLineToken');
const result = await exchangeLineToken({
  code,
  redirectUri: `${window.location.origin}/line/callback`,
  campaignId: campaign.id,
});

const { lineUserId } = result.data;
```

**What happens:**
- Authorization code is extracted from URL
- Pending submission data is retrieved from `sessionStorage`
- Firebase Function is called to securely exchange the code for LINE User ID

### Step 3: Server-Side Token Exchange

**Location**: `functions/src/index.ts` - `exchangeLineToken` function

This function securely exchanges the authorization code for a LINE User ID:

```typescript
export const exchangeLineToken = async (data, context) => {
  const { code, redirectUri, campaignId } = data;
  
  // 1. Get campaign from Firestore to retrieve LINE credentials
  const campaign = await admin.firestore()
    .collection("campaigns")
    .doc(campaignId)
    .get();
  
  // 2. Exchange authorization code for access token
  const tokenResponse = await fetch("https://api.line.me/oauth2/v2.1/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: campaign.lineChannelId,
      client_secret: campaign.lineChannelSecret, // SECRET - never exposed to client
    }),
  });
  
  // 3. Decode ID token to extract LINE User ID
  const idTokenPayload = JSON.parse(
    Buffer.from(tokenData.id_token.split(".")[1], "base64").toString()
  );
  const lineUserId = idTokenPayload.sub;
  
  // 4. Return LINE User ID (not the full token)
  return { lineUserId, success: true };
};
```

**Security Note:**
- LINE Channel Secret is **never** exposed to the client
- Token exchange happens server-side only
- Only the LINE User ID is returned to the client

### Step 4: Save Submission with LINE User ID

**Location**: `pages/line/LineCallback.tsx`

After obtaining the LINE User ID, the submission is saved to Firestore:

```typescript
const submissionWithUser: Omit<Submission, 'id'> = {
  ...pendingSubmission,
  lineUserId, // Add LINE User ID
  delivered: false,
  deliveredAt: calculateDeliveryDateTime(campaign, new Date()).toISOString(),
};

// Save to Firestore
await addSubmission(submissionWithUser);
```

**What's stored:**
- All form data
- LINE User ID (for sending messages later)
- Scheduled delivery time (`deliveredAt`)
- Delivery status (`delivered: false`)

### Step 5: Scheduled Delivery

**Location**: `functions/src/index.ts` - `processScheduledDeliveries` function

The scheduled function runs every 10 minutes and checks for pending deliveries:

```typescript
export const processScheduledDeliveries = functions
  .schedule("every 10 minutes")
  .timeZone("Asia/Tokyo")
  .onRun(async (context) => {
    // 1. Get all undelivered submissions
    const undeliveredSubmissions = submissions.filter(
      doc => doc.data().delivered !== true
    );
    
    // 2. Check if delivery time has passed
    for (const submission of undeliveredSubmissions) {
      if (now >= submission.deliveredAt && submission.deliveryChoice === 'line') {
        // 3. Send LINE message
        await sendLineHelper(submission.id, campaign.id);
      }
    }
  });
```

### Step 6: Send LINE Message

**Location**: `functions/src/index.ts` - `sendLineHelper` function

This function sends the actual LINE message:

```typescript
async function sendLineHelper(submissionId: string, campaignId: string) {
  // 1. Get submission and campaign from Firestore
  const [submission, campaign] = await Promise.all([
    admin.firestore().collection("submissions").doc(submissionId).get(),
    admin.firestore().collection("campaigns").doc(campaignId).get(),
  ]);
  
  // 2. Validate LINE configuration
  if (!submission.lineUserId) {
    throw new Error("LINE user ID not found");
  }
  if (!campaign.lineChannelId || !campaign.lineChannelSecret) {
    throw new Error("Campaign LINE configuration is incomplete");
  }
  
  // 3. Get LINE access token (Client Credentials Grant)
  const tokenResponse = await fetch("https://api.line.me/oauth2/v2.1/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: campaign.lineChannelId,
      client_secret: campaign.lineChannelSecret,
    }),
  });
  
  const { access_token } = await tokenResponse.json();
  
  // 4. Send message using LINE Push Message API
  const messageResponse = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${access_token}`,
    },
    body: JSON.stringify({
      to: submission.lineUserId, // Send to this LINE user
      messages: [
        {
          type: "text",
          text: campaign.lineMessage || submission.formData?.message,
        },
        // Optional: include image if available
        ...(submission.formData?.imageUrl ? [{
          type: "image",
          originalContentUrl: submission.formData.imageUrl,
          previewImageUrl: submission.formData.imageUrl,
        }] : []),
      ],
    }),
  });
  
  // 5. Mark as delivered
  await submission.ref.update({
    delivered: true,
    actualDeliveredAt: admin.firestore.Timestamp.now(),
  });
}
```

## Key Components

### 1. LINE OAuth Flow
- **Authorization URL**: `https://access.line.me/oauth2/v2.1/authorize`
- **Token Exchange**: `https://api.line.me/oauth2/v2.1/token`
- **Scopes**: `profile openid` (to get user ID)

### 2. LINE Messaging API
- **Push Message API**: `https://api.line.me/v2/bot/message/push`
- **Authentication**: Client Credentials Grant (server-to-server)
- **Message Types**: Text, Image, etc.

### 3. Security Features
- ✅ LINE Channel Secret never exposed to client
- ✅ Token exchange happens server-side
- ✅ Only LINE User ID stored in Firestore (not full tokens)
- ✅ Access tokens obtained fresh for each message send

## Required Configuration

### Campaign Settings
Each campaign needs:
- `lineChannelId`: LINE Channel ID
- `lineChannelSecret`: LINE Channel Secret
- `deliveryChannel`: Set to `"line"` or allow both `"email"` and `"line"`
- `lineMessage`: Optional custom message (defaults to form message)

### LINE Developer Console Setup
1. Create a LINE Channel (Messaging API)
2. Get Channel ID and Channel Secret
3. Set Callback URL: `https://your-domain.com/line/callback`
4. Enable Messaging API

## Message Content

The LINE message can include:
- **Text**: From `campaign.lineMessage` or `submission.formData.message`
- **Image**: If `submission.formData.imageUrl` exists, it's included as an image message

## Delivery Timing

- Messages are sent based on `deliveredAt` field (scheduled time)
- Scheduled function runs every 10 minutes
- Maximum delay: 10 minutes from scheduled time
- Can also be triggered manually via `sendLineMessage` function

## Error Handling

Common errors and solutions:

1. **"LINE user ID not found"**
   - User didn't complete OAuth flow
   - Submission was created without LINE authorization

2. **"Campaign LINE configuration is incomplete"**
   - Missing `lineChannelId` or `lineChannelSecret` in campaign

3. **"Failed to get LINE access token"**
   - Invalid Channel ID or Secret
   - Check LINE Developer Console settings

4. **"Failed to send LINE message"**
   - LINE User ID is invalid
   - User blocked the LINE bot
   - Check LINE API response for details

## Testing

### Manual Test
```bash
# Call sendLineMessage function directly
curl -X POST https://asia-northeast1-futuremessage-app.cloudfunctions.net/sendLineMessage \
  -H "Content-Type: application/json" \
  -d '{
    "data": {
      "submissionId": "YOUR_SUBMISSION_ID",
      "campaignId": "YOUR_CAMPAIGN_ID"
    }
  }'
```

### Check Logs
```bash
firebase functions:log --only sendLineMessage,processScheduledDeliveries
```

## Summary

1. **User Flow**: Submit form → Authorize LINE → Submission saved with LINE User ID
2. **Scheduled Function**: Runs every 10 minutes, checks `deliveredAt`, sends messages
3. **Message Sending**: Gets access token → Calls LINE Push API → Marks as delivered
4. **Security**: All secrets stay server-side, only User ID stored in database

The system ensures secure, scheduled delivery of LINE messages while keeping sensitive credentials protected.

