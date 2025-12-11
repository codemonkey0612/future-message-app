# Fix for deliveredAt Not Showing in Firestore

## Problem
When clicking the submission button, `deliveredAt` was not displaying in Firestore, and emails were not being sent at the scheduled time.

## Root Cause
1. **`deliveredAt` was being set to `undefined`** when `scheduledDeliveryTime` was `null`
2. **`sanitizeData` function removes `undefined` values** using `JSON.parse(JSON.stringify())`, which removed the `deliveredAt` field
3. **The field was not being explicitly preserved** in the `addSubmission` function

## Fixes Applied

### 1. Always Set `deliveredAt` to a String Value
**File: `pages/client/MessageForm.tsx`**
- Changed from: `deliveredAt: scheduledDeliveryTime || undefined`
- Changed to: Always calculate a delivery time (defaults to 1 day from now if no delivery type)
- Now: `deliveredAt: scheduledDeliveryTime` (always a string)

### 2. Explicitly Preserve `deliveredAt` in Firestore Service
**File: `services/firestoreService.ts`**
- Completely rewrote `addSubmission` function
- Now explicitly builds the data object and always includes `deliveredAt` if it exists
- Added verification step to confirm the data was saved correctly
- Added console logs for debugging

### 3. Updated Scheduled Function to Use `deliveredAt`
**File: `functions/src/index.ts`**
- Scheduled function now checks `deliveredAt` first (preferred method)
- Falls back to calculating from campaign settings if `deliveredAt` doesn't exist (backward compatibility)
- Handles both string and Timestamp formats

### 4. Added Console Logging
- Added logs in `MessageForm.tsx` to show when `deliveredAt` is calculated
- Added logs in `firestoreService.ts` to show what data is being saved
- Added verification logs to confirm the data was saved correctly

## How to Verify the Fix

### Step 1: Create a New Submission
1. Go to your campaign page
2. Fill out the form and submit
3. Open browser console (F12) and look for:
   - `[MessageForm] Creating submission with deliveredAt: <timestamp>`
   - `[firestoreService] Adding submission with data: {...}`
   - `[firestoreService] deliveredAt value: <timestamp>`
   - `[firestoreService] Verified saved data - deliveredAt: <timestamp>`

### Step 2: Check Firestore
1. Go to Firebase Console > Firestore Database
2. Navigate to `submissions` collection
3. Find your new submission
4. Verify you see:
   - `delivered: false`
   - `deliveredAt: <ISO timestamp string>`

### Step 3: Verify Scheduled Delivery
1. Wait for the scheduled time (or use manual trigger)
2. Check function logs:
   ```bash
   firebase functions:log --only processScheduledDeliveries
   ```
3. Look for:
   - `[processScheduledDeliveries] Submission X: Using deliveredAt (scheduled time)=...`
   - `shouldDeliver=true` when the time is reached
   - `[processScheduledDeliveries] Email delivered successfully`

## Testing Checklist

- [ ] Create a new submission
- [ ] Check browser console for logs showing `deliveredAt` is calculated
- [ ] Check Firestore to verify `deliveredAt` field exists
- [ ] Verify `deliveredAt` shows the correct scheduled time
- [ ] Wait for scheduled time or use manual trigger
- [ ] Verify email is sent automatically
- [ ] Check that `delivered` changes to `true` after sending

## Manual Trigger for Testing

If you want to test immediately without waiting:

```bash
curl https://asia-northeast1-futuremessage-app.cloudfunctions.net/triggerScheduledDeliveries
```

Or open in browser:
https://asia-northeast1-futuremessage-app.cloudfunctions.net/triggerScheduledDeliveries

## Important Notes

1. **`deliveredAt` is set when submission is created** - it shows the scheduled delivery time
2. **`deliveredAt` is NOT updated when email is sent** - it stays as the scheduled time
3. **`delivered` changes from `false` to `true`** when email is actually sent
4. **The scheduled function runs every hour** - emails will be sent within 1 hour of the scheduled time

## If Still Not Working

1. **Check browser console** for any errors during submission
2. **Check Firestore** to see if the submission was created
3. **Check function logs** to see if the scheduled function is running
4. **Verify campaign settings**:
   - `deliveryType` is set to `"datetime"` or `"interval"`
   - `deliveryChannel` is set to `"email"`
   - For datetime: `deliveryDateTime` is set
   - For interval: `deliveryIntervalDays` is set

