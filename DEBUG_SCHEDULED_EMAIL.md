# Debugging Scheduled Email Delivery

## Issue
Emails are not being sent automatically at the scheduled time. The `delivered` field remains `false`.

## How to Check Logs

### 1. Check if the scheduled function is running:
```bash
cd functions
firebase functions:log --only processScheduledDeliveries
```

Or check in the Firebase Console:
- Go to: https://console.firebase.google.com/project/futuremessage-app/functions/logs
- Filter by function name: `processScheduledDeliveries`

### 2. Look for these log messages:
- `[processScheduledDeliveries] Started at ...` - Function is running
- `[processScheduledDeliveries] Found X campaigns with scheduled delivery` - Campaigns found
- `[processScheduledDeliveries] Processing campaign ...` - Processing each campaign
- `[processScheduledDeliveries] Submission ...: shouldDeliver=true/false` - Delivery decision
- `[processScheduledDeliveries] Scheduling delivery for submission ...` - Delivery scheduled
- `[processScheduledDeliveries] Email delivered successfully for submission ...` - Success
- `[processScheduledDeliveries] Failed to deliver email for submission ...` - Error

## Common Issues

### 1. Function Not Running
- Check if the Cloud Scheduler job exists:
  - Go to: https://console.cloud.google.com/cloudscheduler?project=futuremessage-app
  - Look for a job named `firebase-schedule-processScheduledDeliveries-asia-northeast1`
  - Check if it's enabled and running

### 2. Date/Time Comparison Issues
- The function compares `now >= deliveryTime`
- Make sure `deliveryDateTime` is set correctly in the campaign
- Check timezone: The function uses `Asia/Tokyo` timezone
- If `deliveryDateTime` is a string like "2025-12-11T14:00", it's assumed to be in Asia/Tokyo timezone

### 3. Campaign Configuration
- Check that `deliveryType` is set to `"datetime"` or `"interval"`
- Check that `deliveryChannel` is set to `"email"`
- For datetime: Check that `deliveryDateTime` is set
- For interval: Check that `deliveryIntervalDays` is set

### 4. Submission Status
- Check that `delivered` field is `false` or doesn't exist
- Check that `campaignId` matches the campaign

### 5. Email Configuration
- Check that SMTP environment variables are set:
  - `SMTP_HOST`
  - `SMTP_PORT`
  - `EMAIL_USER`
  - `EMAIL_PASSWORD`
- Check email logs for SMTP errors

## Manual Testing

### Test the function manually using the trigger endpoint:
```bash
# Call the manual trigger function via HTTP:
curl https://asia-northeast1-futuremessage-app.cloudfunctions.net/triggerScheduledDeliveries

# Or open in browser:
# https://asia-northeast1-futuremessage-app.cloudfunctions.net/triggerScheduledDeliveries
```

This will immediately run the delivery process and show detailed logs for all submissions.

### Test email sending directly:
Use Postman or curl to call `sendEmailMessage`:
```bash
curl -X POST https://asia-northeast1-futuremessage-app.cloudfunctions.net/sendEmailMessage \
  -H "Content-Type: application/json" \
  -d '{
    "data": {
      "submissionId": "YOUR_SUBMISSION_ID",
      "campaignId": "YOUR_CAMPAIGN_ID"
    }
  }'
```

## Fix Applied

1. **Improved logging**: Added detailed console logs at every step, including:
   - All submissions found for each campaign
   - Email addresses and delivery status for each submission
   - Detailed date/time comparisons
   - Success/failure of each delivery attempt

2. **Better date comparison**: Changed from `now >= deliveryTime` to `now.toMillis() >= deliveryTime.toMillis()` for more reliable comparison

3. **Error handling**: Errors are now logged with full context

4. **Manual trigger function**: Created `triggerScheduledDeliveries` HTTP function for immediate testing

5. **deliveredAt field**: The field is set as a Firestore Timestamp (serverTimestamp), which should appear in Firebase Console. If it doesn't show, try:
   - Refreshing the page
   - Checking the raw data view
   - The field might be named `deliveredAt` (not `deliveryAt`)

## Troubleshooting Specific Issues

### Issue: Can't find submission in logs
If you can't find a specific email address (e.g., `tajdine.elm@atomicmail.io`) in the logs:

1. **Check if the submission exists in Firestore**:
   - Go to Firebase Console > Firestore Database
   - Search for the email address in the `submissions` collection
   - Verify the `campaignId` matches the campaign

2. **Check campaign configuration**:
   - Verify `deliveryType` is set to `"datetime"` or `"interval"`
   - Verify `deliveryChannel` is set to `"email"`
   - For datetime: Check that `deliveryDateTime` is set and in the past
   - For interval: Check that `deliveryIntervalDays` is set

3. **Check submission status**:
   - Verify `delivered` is `false` or doesn't exist
   - Verify `deliveryChoice` is `"email"`
   - Verify `formData.email` contains the email address

4. **Use the manual trigger**:
   ```bash
   curl https://asia-northeast1-futuremessage-app.cloudfunctions.net/triggerScheduledDeliveries
   ```
   This will show ALL submissions being checked, including the email addresses.

### Issue: deliveredAt not showing in Firebase Console
- The field is a Firestore Timestamp, not a string
- It should appear as a date/time field in Firebase Console
- If it doesn't show:
  - Refresh the page
  - Check the raw JSON view
  - Verify the field name is `deliveredAt` (not `deliveryAt`)
  - The field is only set AFTER successful email delivery

## Next Steps

1. **Use the manual trigger** to test immediately:
   ```bash
   curl https://asia-northeast1-futuremessage-app.cloudfunctions.net/triggerScheduledDeliveries
   ```

2. **Check the logs** after running the manual trigger:
   ```bash
   firebase functions:log --only triggerScheduledDeliveries
   ```

3. **Look for your email address** in the logs - you should see:
   - `Submission X: email=tajdine.elm@atomicmail.io`
   - Whether `shouldDeliver=true` or `false`
   - Any errors during delivery

4. **Verify the data**:
   - Campaign has correct `deliveryType` and `deliveryChannel`
   - Submission has correct `campaignId` and `deliveryChoice`
   - `deliveryDateTime` is in the past (for datetime type)
   - `delivered` is `false`

If emails still aren't sending, check:
- SMTP configuration
- Email deliverability (check spam folder)
- Firestore data structure matches expected format

