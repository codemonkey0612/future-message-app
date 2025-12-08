# Firebase Storage Setup Guide

## Issue: Image Upload Not Working

If you're experiencing issues uploading images, Firebase Storage may not be enabled in your Firebase project.

## Steps to Enable Firebase Storage

1. **Go to Firebase Console**
   - Visit: https://console.firebase.google.com/project/futuremessage-app/storage
   - Or navigate: Firebase Console → Your Project → Storage

2. **Click "Get Started"**
   - If you see a "Get Started" button, click it to initialize Firebase Storage

3. **Choose Storage Location**
   - Select a location (recommended: `asia-northeast1` for Japan, or `us-central1` for US)
   - This should match your Firestore location

4. **Security Rules**
   - Choose "Start in test mode" for initial setup, or
   - Use "Start in production mode" with the rules from `storage.rules`

5. **Deploy Storage Rules**
   ```bash
   firebase deploy --only storage:rules
   ```

## Verify Storage is Enabled

After enabling Storage, verify it's working:

1. Check Firebase Console → Storage
2. You should see an empty bucket (no files yet)
3. Try uploading an image in the admin panel

## Troubleshooting

### Error: "Firebase Storage has not been set up"
- **Solution**: Follow steps 1-4 above to enable Storage

### Error: "storage/unauthorized"
- **Solution**: 
  1. Make sure you're logged in as an admin
  2. Deploy storage rules: `firebase deploy --only storage:rules`
  3. Check that `storage.rules` allows authenticated users to upload

### Error: "storage/unknown" or network errors
- **Solution**:
  1. Check your internet connection
  2. Verify Firebase Storage is enabled in the Console
  3. Check browser console for detailed error messages

### File size errors
- **Current limit**: 10MB per image
- **Solution**: Compress images before uploading

## Current Storage Rules

The storage rules in `storage.rules` allow:
- **Campaign images**: Authenticated admins can upload (10MB limit, images only)
- **Submission images**: Anyone can upload (10MB limit, images only)
- **Public read**: All images are publicly readable

## Testing Upload

After setup, test by:
1. Log in as admin
2. Go to Campaign Editor
3. Try uploading a small image (< 10MB)
4. Check Firebase Console → Storage to see the uploaded file

