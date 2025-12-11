# Check Function Logs - Step by Step

## Your Situation
- **Delivery Time**: December 11, 2025 at 12:03 PM
- **Function Deployed**: December 11, 2025 at 11:52 AM
- **Function Running**: Yes (24 invocations in 24 hours)
- **Email Not Received**: ❌

## Step 1: Check Function Logs

1. **Go to Firebase Console** → Functions → Logs
2. **Filter by**: `processScheduledDeliveries`
3. **Look for logs around 12:03 PM** (or after)
4. **Check for**:
   - "Checked X campaigns, found Y deliveries to process"
   - "Delivery time reached for submission..."
   - "Email delivered for submission..."
   - "Failed to deliver email..."
   - Any error messages

## Step 2: Check Submission Status

1. **Go to Firestore** → `submissions` collection
2. **Find your submission** (the one with email `tajdine.elm@gmail.com`)
3. **Check**:
   - `delivered`: Should be `false` if email wasn't sent
   - `deliveryChoice`: Should be `"email"`
   - `formData.email`: Should be `"tajdine.elm@gmail.com"`
   - `submittedAt`: When was it submitted?

## Step 3: Verify Campaign Settings

From your admin panel, the campaign should have:
- `deliveryType`: `"datetime"`
- `deliveryChannel`: `"email"`
- `deliveryDateTime`: Should be stored as `"2025-12-11T12:03"` or similar

**Check in Firestore**:
1. Go to `campaigns` collection
2. Find campaign `RbMRrJTZJDxnIYEu48cg`
3. Verify `deliveryDateTime` field format

## Step 4: Common Issues

### Issue 1: Date Format Mismatch
**Problem**: `deliveryDateTime` might be stored in wrong format
**Check**: Look at the actual value in Firestore
**Fix**: Should be ISO format like `"2025-12-11T12:03:00+09:00"` or `"2025-12-11T03:03:00Z"` (UTC)

### Issue 2: Timezone Confusion
**Problem**: Admin panel shows `12:03 PM` but Firestore might store it differently
**Check**: Compare admin panel time vs Firestore value
**Fix**: The function assumes Asia/Tokyo timezone (+09:00)

### Issue 3: Submission Not Found
**Problem**: Function can't find the submission
**Check**: Verify `campaignId` matches exactly
**Fix**: Check for typos or case sensitivity

### Issue 4: Already Delivered
**Problem**: Submission marked as delivered but email wasn't sent
**Check**: Look for `delivered: true` in submission
**Fix**: Reset to `false` and check logs for errors

## Step 5: Manual Test

To verify email sending works, manually trigger it:

```bash
curl -X POST \
  https://asia-northeast1-futuremessage-app.cloudfunctions.net/sendEmailMessage \
  -H "Content-Type: application/json" \
  -d '{
    "data": {
      "submissionId": "YOUR_SUBMISSION_ID",
      "campaignId": "RbMRrJTZJDxnIYEu48cg"
    }
  }'
```

If this works, the issue is with the scheduled function logic, not email sending.

## What to Look For in Logs

After the next scheduled run (within 1 hour), check logs for:

1. **"Checked X campaigns"** - Should show it checked your campaign
2. **"Delivery time reached"** - Should show if time comparison worked
3. **"Email delivered"** - Should show if email was sent
4. **"Failed to deliver"** - Should show any errors

## Quick Diagnostic

Run this to see recent logs:
```bash
npx firebase-tools functions:log --only processScheduledDeliveries --region asia-northeast1 --limit 50
```

