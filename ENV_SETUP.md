# Environment Variables Setup

## Required Environment Variables

Create a `.env.local` file in the root directory with the following:

```env
# Gemini API Key
# Get your API key from: https://makersuite.google.com/app/apikey
GEMINI_API_KEY=your_gemini_api_key_here
```

Optional Firebase Configuration

If you want to use environment variables for Firebase config instead of hardcoding:

```env
# Firebase Configuration (optional)
VITE_FIREBASE_API_KEY=your_firebase_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

Notes

- `.env.local` is gitignored and should not be committed
- Copy `.env.example` (if it exists) to `.env.local` and fill in your values
- For production, set environment variables in your hosting platform

