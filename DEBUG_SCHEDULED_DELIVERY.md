# Debug Scheduled Email Delivery

## Your Campaign Settings (from screenshot)
- `deliveryType`: `"datetime"` ✅
- `deliveryChannel`: `"email"` ✅
- `deliveryDateTime`: `"2025-12-11T11:20"` ⚠️

## Step 1: Verify Delivery Time Has Passed

The scheduled function only sends emails when `now >= deliveryDateTime`.

**Check current date/time:**
- If today is **before December 11, 2025 at 11:20**, the email won't be sent yet
- If today is **after December 11, 2025 at 11:20**, the email should have been sent

## Step 2: Check Scheduled Function Logs

1. **Go to Firebase Console** → Functions → Logs
2. **Filter by**: `processScheduledDeliveries`
3. **Look for recent runs** (should run every hour)
4. **Check for**:
   - "Processed X scheduled deliveries" - function is running
   - "Email delivered for submission..." - email was sent successfully
   - "Failed to deliver email..." - there was an error
   - No logs = function might not be running

## Step 3: Verify Submission Data

Check your submission in Firestore:

1. **Go to** `submissions` collection
2. **Find submission ID**: `mJKdUbfV7JqIPfwcGml7`
3. **Verify it has**:
   - `campaignId`: `"RbMRrJTZJDxnIYEu48cg"` ✅
   - `deliveryChoice`: `"email"` ✅
   - `formData.email`: Valid email address ✅
   - `delivered`: `false` (should be false if not sent yet)
   - `submittedAt`: Should be before deliveryDateTime

## Step 4: Check for Common Issues

### Issue A: Scheduled Function Not Running
**Symptoms**: No logs for `processScheduledDeliveries`
**Fix**: 
- Check if function is deployed: Firebase Console → Functions
- Verify function exists: `processScheduledDeliveries(asia-northeast1)`
- Check Cloud Scheduler: Google Cloud Console → Cloud Scheduler

### Issue B: Delivery Time Not Reached
**Symptoms**: Function runs but shows "Processed 0 scheduled deliveries"
**Fix**: 
- Wait for delivery time, OR
- Update `deliveryDateTime` to past date for testing

### Issue C: Submission Not Found
**Symptoms**: Function runs but doesn't find submissions
**Fix**:
- Verify `campaignId` matches exactly
- Verify `delivered` field is `false`
- Check Firestore indexes if using complex queries

### Issue D: Email Sending Failed
**Symptoms**: Logs show "Failed to deliver email..."
**Fix**:
- Check SMTP configuration
- Verify email credentials
- Check function logs for specific error

## Step 5: Manual Testing

To test immediately without waiting:

1. **Update deliveryDateTime to past**:
   - In Firestore, edit campaign `RbMRrJTZJDxnIYEu48cg`
   - Change `deliveryDateTime` to: `"2020-01-01T00:00:00Z"` (any past date)

2. **Wait for scheduled function** (runs every hour), OR

3. **Manually trigger email**:
   ```bash
   curl -X POST \
     https://asia-northeast1-futuremessage-app.cloudfunctions.net/sendEmailMessage \
     -H "Content-Type: application/json" \
     -d '{
       "data": {
         "submissionId": "mJKdUbfV7JqIPfwcGml7",
         "campaignId": "RbMRrJTZJDxnIYEu48cg"
       }
     }'
   ```

## Step 6: Check Function Execution

Verify the scheduled function logic:

The function checks:
```javascript
if (campaign.deliveryType === "datetime" && campaign.deliveryDateTime) {
  const deliveryTime = admin.firestore.Timestamp.fromDate(
    new Date(campaign.deliveryDateTime)
  );
  shouldDeliver = now >= deliveryTime;
}
```

**Potential issues**:
- `deliveryDateTime` format might not be parsed correctly
- Timezone differences (function uses Asia/Tokyo timezone)
- Date comparison might fail

## Quick Diagnostic Commands

### Check if function is deployed:
```bash
npx firebase-tools functions:list
```

### Check function logs:
```bash
npx firebase-tools functions:log --only processScheduledDeliveries --region asia-northeast1
```

### Check recent submissions:
Go to Firestore → `submissions` → Check if submission exists and has correct data

## Most Likely Issues

1. **Delivery time hasn't arrived yet** (if current date < 2025-12-11)
2. **Scheduled function not running** (check logs)
3. **Timezone mismatch** (function uses Asia/Tokyo, deliveryDateTime might be in different timezone)
4. **Email sent but in spam folder** (check spam/junk)

## Immediate Action Items

1. ✅ Check current date/time vs deliveryDateTime
2. ✅ Check Firebase Functions logs for `processScheduledDeliveries`
3. ✅ Verify submission exists with correct data
4. ✅ Check spam folder for email
5. ✅ Manually trigger email for testing (bypass scheduled function)

