# LINE Messaging Function Testing Guide

This guide explains how to test the LINE messaging functionality in the Future Message App.

## Prerequisites

### 1. LINE Developer Account Setup

1. Go to [LINE Developers Console](https://developers.line.biz/console/)
2. Create or select a provider
3. Create a **Messaging API** channel (not LINE Login)
4. Note down:
   - **Channel ID** (e.g., `1234567890`)
   - **Channel Secret** (e.g., `abcdef1234567890abcdef1234567890`)

### 2. Campaign Configuration

1. Log into the admin panel
2. Create or edit a campaign
3. Set **Delivery Channel** to `LINE`
4. Enter your LINE Channel ID and Channel Secret in the campaign settings
5. Save the campaign

### 3. LINE Bot Setup

**Important**: The LINE user ID you want to send messages to must have:
- Added your LINE bot as a friend
- Enabled messaging with your bot

## Testing Steps

### Step 1: Get Your LINE User ID

There are two ways to get a LINE User ID:

#### Method A: Using LINE Developers Console (Recommended)
1. In your Messaging API channel settings, go to the "Messaging API" tab
2. Scroll down to "Webhook settings"
3. Enable webhook and set a webhook URL (optional for testing)
4. Use the "Verify" button to test webhook
5. Send a message to your bot from the LINE app
6. Check webhook logs or use LINE's API to get user IDs

#### Method B: Using LINE API
You can use the LINE Messaging API to get user IDs of users who have added your bot as a friend. This requires making API calls.

**Note**: LINE User IDs look like: `U1234567890abcdef1234567890abcdef`

### Step 2: Test the Form Submission

1. Open the campaign form URL (public client view)
2. Fill in the form:
   - **Message**: Enter your test message
   - **LINE ID**: Enter the LINE User ID you want to send to (from Step 1)
   - **Image** (optional): Upload an image if you want to test image sending
3. Accept terms and conditions
4. Click "メッセージを送信" (Send Message)

### Step 3: Check Browser Console

Open Developer Tools (F12) and check the Console tab for logs:

```
[MessageForm] Input changed - lineId: U1234567890abcdef1234567890abcdef
[MessageForm] Creating LINE submission:
[MessageForm] - Original formData: {...}
[MessageForm] - Sanitized formData: {...}
[MessageForm] - LINE ID in formData: U1234567890abcdef1234567890abcdef
[MessageForm] - LINE ID in sanitizedFormData: U1234567890abcdef1234567890abcdef
[MessageForm] Submission data before sending: {...}
[MessageForm] Submission created successfully
```

### Step 4: Check Firebase Functions Logs

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Navigate to: **Functions** → **Logs**
3. Look for logs from `sendLineMessage` function:

```
[sendLineHelper] Submission formData: {...}
[sendLineHelper] Extracted LINE user ID: U1234567890abcdef1234567890abcdef
[sendLineHelper] Using trimmed LINE user ID: U1234567890abcdef1234567890abcdef
[sendLineHelper] Sending LINE message to user U1234567890abcdef1234567890abcdef with X message(s)
```

### Step 5: Verify Message Delivery

1. Open the LINE app on the device/account with the LINE User ID you specified
2. Check if the message was received from your bot
3. The message should contain:
   - The text message from the form
   - Image (if uploaded)
   - Custom form fields (if any)

## Testing Scheduled Delivery

If your campaign has scheduled delivery:

1. **For datetime delivery**: Set `deliveryDateTime` to a future date
2. **For interval delivery**: Set `deliveryIntervalDays` to test delayed delivery
3. Check Firebase Functions logs for `processScheduledDeliveries` execution
4. The message will be sent at the scheduled time

## Manual Testing via Firebase Console

You can manually trigger message sending:

1. Go to Firebase Console → **Functions**
2. Find `sendLineMessage` function
3. Use "Test" button or call via HTTP:
   ```bash
   curl -X POST https://asia-northeast1-futuremessage-app.cloudfunctions.net/sendLineMessage \
     -H "Content-Type: application/json" \
     -d '{"data": {"submissionId": "YOUR_SUBMISSION_ID", "campaignId": "YOUR_CAMPAIGN_ID"}}'
   ```

## Common Issues and Troubleshooting

### Issue: "LINE user ID not found in submission formData"

**Cause**: LINE ID was not entered or not saved properly

**Solution**:
- Check browser console logs for LINE ID input
- Verify the form field name is `lineId`
- Check that `sanitizeFormData` is preserving the `lineId` field

### Issue: "LINE user ID not found in submission formData or is invalid"

**Cause**: LINE ID is empty, null, or invalid format

**Solution**:
- Verify LINE User ID format (should start with `U` followed by alphanumeric characters)
- Check that the input is not just whitespace
- Verify validation is passing

### Issue: "Failed to get LINE access token"

**Cause**: Invalid Channel ID or Channel Secret

**Solution**:
- Double-check Channel ID and Channel Secret in campaign settings
- Verify credentials in LINE Developers Console
- Ensure no extra spaces or characters

### Issue: Message not received in LINE app

**Possible Causes**:
1. **User hasn't added the bot as friend**: The LINE user must add your bot as a friend first
2. **Invalid LINE User ID**: The user ID doesn't exist or is incorrect
3. **Bot is in approval mode**: Check LINE Developers Console → Messaging API settings
4. **Rate limiting**: LINE API has rate limits - wait a few minutes and try again

**Solution**:
- Verify the LINE User ID is correct
- Ensure the user has added your bot as a friend
- Check Firebase Functions logs for API error responses
- Try sending a test message from LINE Developers Console first

### Issue: Image not sent

**Cause**: Image URL is invalid or image is too large

**Solution**:
- Check Firebase Storage logs
- Verify image URL is accessible
- Check LINE API response for image-related errors
- Images must be JPEG or PNG format
- Image URLs must be publicly accessible HTTPS URLs

## Testing Checklist

- [ ] LINE Channel ID and Secret configured in campaign
- [ ] Campaign delivery channel set to "LINE"
- [ ] LINE User ID obtained and verified
- [ ] User has added LINE bot as friend
- [ ] Form submission successful (check browser console)
- [ ] Submission created in Firestore (check Firebase Console)
- [ ] Function logs show LINE ID extraction successful
- [ ] LINE API token obtained successfully
- [ ] Message sent to LINE API successfully
- [ ] Message received in LINE app
- [ ] Image received (if uploaded)

## Debugging Tips

1. **Enable verbose logging**: Check both browser console and Firebase Functions logs
2. **Test with simple message first**: Start with text-only message before adding images
3. **Verify LINE credentials**: Test credentials using LINE API directly first
4. **Check Firestore**: Verify submission data is saved correctly in Firestore
5. **Check LINE Developers Console**: Monitor API usage and errors in LINE console

## API Endpoints

- **Send LINE Message**: `https://asia-northeast1-futuremessage-app.cloudfunctions.net/sendLineMessage`
- **LINE Push Message API**: `https://api.line.me/v2/bot/message/push`

## Additional Resources

- [LINE Messaging API Documentation](https://developers.line.biz/en/docs/messaging-api/)
- [LINE Developers Console](https://developers.line.biz/console/)
- [Firebase Functions Logs](https://console.firebase.google.com/project/futuremessage-app/functions)

