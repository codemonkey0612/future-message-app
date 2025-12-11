# Testing Email Delivery - Complete Guide

## How Email Delivery Works

1. **User submits form** → Submission saved to Firestore
2. **Scheduled function runs** (every hour) → Checks if delivery time has arrived
3. **If time has arrived** → Email is sent automatically

**Important**: The frontend does NOT call `sendEmailMessage` directly. Emails are sent by the scheduled function based on campaign delivery settings.

## Why You're Not Receiving Emails

The scheduled function only processes submissions if:
- Campaign has `deliveryType` set to `"datetime"` or `"interval"`
- Delivery time has arrived (for datetime) or enough days have passed (for interval)

If your campaign doesn't have `deliveryType` set, emails will **never** be sent automatically.

## Testing Methods

### Method 1: Check Campaign Settings (Recommended)

1. **Go to Firebase Console** → Firestore → `campaigns` collection
2. **Find your campaign** (ID: `RbMRrJTZJDxnIYEu48cg`)
3. **Check these fields**:
   - `deliveryType`: Must be `"datetime"` or `"interval"`
   - `deliveryChannel`: Must be `"email"`
   - `deliveryDateTime`: If `deliveryType` is `"datetime"`, this must be in the past
   - `deliveryIntervalDays`: If `deliveryType` is `"interval"`, this is the number of days

4. **If `deliveryType` is missing or wrong**, update it:
   ```json
   {
     "deliveryType": "datetime",
     "deliveryDateTime": "2024-01-01T00:00:00Z",  // Set to past date for immediate delivery
     "deliveryChannel": "email"
   }
   ```

5. **Wait for scheduled function** (runs every hour) or manually trigger it (see Method 3)

### Method 2: Test with Immediate Delivery (For Testing)

Update your campaign to deliver immediately:

1. **Set delivery to past date**:
   - `deliveryType`: `"datetime"`
   - `deliveryDateTime`: Set to yesterday or earlier
   - `deliveryChannel`: `"email"`

2. **Wait up to 1 hour** for scheduled function to run, OR

3. **Manually trigger the scheduled function** (see Method 3)

### Method 3: Manually Trigger Email (For Testing)

You can manually call `sendEmailMessage` for testing:

**Using Postman:**
```
POST https://asia-northeast1-futuremessage-app.cloudfunctions.net/sendEmailMessage
Content-Type: application/json

{
  "data": {
    "submissionId": "YOUR_SUBMISSION_ID",
    "campaignId": "YOUR_CAMPAIGN_ID"
  }
}
```

**Using curl:**
```bash
curl -X POST \
  https://asia-northeast1-futuremessage-app.cloudfunctions.net/sendEmailMessage \
  -H "Content-Type: application/json" \
  -d '{
    "data": {
      "submissionId": "YOUR_SUBMISSION_ID",
      "campaignId": "YOUR_CAMPAIGN_ID"
    }
  }'
```

### Method 4: Check Scheduled Function Logs

Check if the scheduled function is running and processing submissions:

1. **Go to Firebase Console** → Functions → Logs
2. **Filter by**: `processScheduledDeliveries`
3. **Look for**:
   - "Processed X scheduled deliveries" - means it ran
   - "Email delivered for submission..." - means email was sent
   - "Failed to deliver email..." - means there was an error

### Method 5: Test with Immediate Interval (For Testing)

Set up a campaign that delivers immediately:

1. **Update campaign**:
   ```json
   {
     "deliveryType": "interval",
     "deliveryIntervalDays": 0,  // Deliver immediately
     "deliveryChannel": "email"
   }
   ```

2. **Create a new submission** (or update existing one's `submittedAt` to current time)

3. **Wait for scheduled function** (runs every hour) or manually trigger

## Common Issues

### Issue 1: Campaign Missing `deliveryType`
**Symptom**: Submissions are created but emails never sent
**Fix**: Set `deliveryType` to `"datetime"` or `"interval"` in campaign

### Issue 2: Delivery Time Not Arrived
**Symptom**: Scheduled function runs but doesn't send emails
**Fix**: 
- For `datetime`: Set `deliveryDateTime` to past date
- For `interval`: Wait for `deliveryIntervalDays` to pass, or set to `0` for testing

### Issue 3: Wrong Delivery Channel
**Symptom**: Error "This submission is not configured for email delivery"
**Fix**: Set `deliveryChannel` to `"email"` in campaign, or `deliveryChoice` to `"email"` in submission

### Issue 4: Email in Spam Folder
**Symptom**: Function succeeds but no email received
**Fix**: Check spam folder, verify sender email is whitelisted

## Quick Test Checklist

- [ ] Campaign has `deliveryType` set (`"datetime"` or `"interval"`)
- [ ] Campaign has `deliveryChannel` set to `"email"`
- [ ] Submission has `deliveryChoice` set to `"email"`
- [ ] Submission has valid `formData.email`
- [ ] Delivery time has arrived (for datetime) or interval has passed (for interval)
- [ ] Scheduled function is running (check logs)
- [ ] SMTP credentials are configured correctly
- [ ] Check spam folder

## For Immediate Testing

1. **Update campaign** to deliver immediately:
   ```json
   {
     "deliveryType": "datetime",
     "deliveryDateTime": "2020-01-01T00:00:00Z",  // Past date
     "deliveryChannel": "email"
   }
   ```

2. **Manually trigger email** using Postman/curl with submission ID

3. **Or wait up to 1 hour** for scheduled function to process it

## Verify Email Was Sent

1. **Check function logs**:
   ```bash
   npx firebase-tools functions:log --only sendEmailMessage --region asia-northeast1
   ```

2. **Check submission in Firestore**:
   - Look for `delivered: true`
   - Look for `deliveredAt` timestamp

3. **Check your email** (including spam folder)

