# Future Message App - Project Overview

## 🎯 What is This Project?

**Future Message App** is a web application that allows users to write messages to their future selves or others, which are then delivered at a specified time in the future via email or LINE (a popular messaging app in Japan). It's designed for campaigns where organizations can collect messages from participants and schedule them for future delivery.

## 🏗️ Architecture Overview

The project consists of three main parts:

1. **Frontend (React + TypeScript + Vite)**
   - User-facing campaign pages
   - Admin dashboard for managing campaigns
   - Responsive design with Tailwind CSS

2. **Backend (Firebase Cloud Functions)**
   - Secure server-side operations
   - Email and LINE message delivery
   - Scheduled delivery processing

3. **Database & Storage (Firebase)**
   - Firestore for data storage
   - Firebase Storage for images
   - Firebase Authentication for admin access

## 📊 Core Concepts

### Campaign
A campaign is the main entity that contains:
- **Basic Info**: Name, description, publish dates, submission window
- **Delivery Settings**: 
  - Type: `interval` (X days after submission) or `datetime` (specific date/time)
  - Channel: `email` or `line`
- **Form Settings**: Customizable fields (message, email, image, custom fields)
- **Survey Settings**: Optional survey questions
- **Design Settings**: Theme colors, backgrounds, visuals
- **Content Settings**: How-to guides, FAQ, terms, privacy policy

### Submission
When a user submits a message, it creates a submission with:
- Campaign ID
- Form data (message, email, image, custom fields)
- Survey answers
- Delivery choice (email or LINE)
- Submission timestamp
- Delivery status

## 🔄 How It Works - User Flow

### 1. Public User Journey

```
User visits /campaign/:id
    ↓
Campaign page loads with custom design
    ↓
User fills out message form (message, email, optional image)
    ↓
If LINE delivery: User authenticates with LINE OAuth
    ↓
Optional survey appears
    ↓
Submission saved to Firestore
    ↓
Scheduled function processes delivery at the right time
    ↓
Email/LINE message sent to user
```

### 2. Admin Journey

```
Admin logs in at /admin/login
    ↓
Admin dashboard shows list of clients/campaigns
    ↓
Admin creates/edits campaigns with:
    - Form configuration
    - Delivery settings
    - Design customization
    - Content management
    ↓
Campaign published and accessible via public URL
    ↓
Admin can view submissions and participants
```

## 🛠️ Technical Stack

### Frontend
- **React 19** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool and dev server
- **React Router** - Client-side routing
- **Tailwind CSS** - Styling
- **Firebase SDK v8** - Firebase integration

### Backend
- **Firebase Cloud Functions v1** - Serverless functions
- **Node.js 20** - Runtime
- **TypeScript** - Type safety
- **Nodemailer** - Email sending
- **LINE API** - LINE messaging

### Infrastructure
- **Firebase Firestore** - NoSQL database
- **Firebase Storage** - File storage
- **Firebase Authentication** - User auth
- **Firebase Hosting** - Web hosting

## 📁 Project Structure

```
future-message-app/
├── pages/
│   ├── client/          # Public-facing pages
│   │   ├── CampaignView.tsx    # Campaign landing page
│   │   ├── MessageForm.tsx     # Message submission form
│   │   └── SurveyModal.tsx     # Survey popup
│   ├── admin/           # Admin dashboard
│   │   ├── AdminLogin.tsx
│   │   ├── CampaignList.tsx
│   │   ├── CampaignEditor.tsx
│   │   └── ParticipantList.tsx
│   └── line/            # LINE OAuth callback
│       └── LineCallback.tsx
├── services/
│   ├── firebase.ts           # Firebase initialization
│   ├── firestoreService.ts   # Database operations
│   └── geminiService.ts      # AI content generation
├── functions/           # Cloud Functions
│   └── src/
│       └── index.ts     # Email/LINE delivery functions
├── components/          # Reusable UI components
├── context/            # React context (auth state)
├── hooks/              # Custom React hooks
├── utils/              # Utility functions
└── types.ts            # TypeScript type definitions
```

## 🔐 Key Features

### 1. Campaign Management
- Create campaigns with customizable forms
- Set delivery schedules (interval or datetime)
- Configure email or LINE delivery
- Customize design (colors, backgrounds, visuals)
- Add content (how-to guides, FAQ, terms)

### 2. Message Submission
- Users submit messages with optional images
- Support for custom form fields
- Email validation
- Image upload to Firebase Storage
- Duplicate submission prevention (localStorage)

### 3. Delivery System
- **Email Delivery**: Uses Nodemailer with SMTP
- **LINE Delivery**: Uses LINE Messaging API
- **Scheduled Processing**: Cloud Function runs every hour
- **Template Support**: Customizable email templates with placeholders

### 4. LINE Integration
- OAuth 2.0 authentication flow
- Secure token exchange on server
- Push message API for delivery
- Image support in LINE messages

### 5. Admin Dashboard
- Campaign CRUD operations
- View submissions and participants
- Gemini AI integration for content generation
- Client management

## 🔄 Data Flow

### Submission Flow
```
1. User submits form → Frontend validates
2. Image uploaded → Firebase Storage → URL returned
3. Submission data → Firestore (submissions collection)
4. Scheduled function checks every hour
5. If delivery time reached → Cloud Function sends email/LINE
6. Submission marked as delivered in Firestore
```

### LINE OAuth Flow
```
1. User clicks LINE delivery → Redirects to LINE OAuth
2. User authorizes → LINE redirects to /line/callback
3. Callback page calls exchangeLineToken function
4. Function exchanges code for access token (server-side)
5. LINE user ID extracted and saved to submission
6. Submission completed
```

## ⚙️ Configuration

### Environment Variables (Frontend)
- `GEMINI_API_KEY` - For AI content generation

### Environment Variables (Functions)
- `SMTP_HOST` - SMTP server hostname
- `SMTP_PORT` - SMTP port (587 or 465)
- `EMAIL_USER` - Email account username
- `EMAIL_PASSWORD` - Email account password

### Firebase Configuration
- Firestore rules in `firestore.rules`
- Storage rules in `storage.rules`
- Functions configuration in `firebase.json`

## 🚀 Deployment

### Frontend
```bash
npm run build
firebase deploy --only hosting
```

### Functions
```bash
cd functions
npm install
npm run build
cd ..
firebase deploy --only functions
```

### All Services
```bash
firebase deploy
```

## 📝 Key Files Explained

- **App.tsx**: Main app component with routing
- **types.ts**: TypeScript interfaces for Campaign, Submission, etc.
- **firestoreService.ts**: All database operations (CRUD)
- **functions/src/index.ts**: Cloud Functions for delivery
- **firestore.rules**: Security rules for database access
- **firebase.json**: Firebase project configuration

## 🔒 Security Features

1. **Firestore Security Rules**: Only admins can read/write campaigns
2. **Server-side Token Exchange**: LINE secrets never exposed to client
3. **Input Sanitization**: All user inputs are sanitized
4. **Email Validation**: Proper email format checking
5. **Authentication**: Admin routes protected by Firebase Auth

## 🎨 Customization

Campaigns are highly customizable:
- **Design**: Colors, backgrounds, images, themes
- **Forms**: Enable/disable fields, custom fields, validation
- **Content**: How-to guides, FAQ, terms, privacy policy
- **Delivery**: Email templates with placeholders, LINE messages

## 📊 Database Schema

### Collections

**campaigns**
- Campaign configuration and settings
- Accessible by admins only

**submissions**
- User message submissions
- Contains form data, survey answers, delivery status
- Public can create, admins can read

**clients**
- Organization/client management
- Admin-only access

## 🔧 Maintenance

- Scheduled function runs every hour to process deliveries
- Failed deliveries are logged but not automatically retried
- Image URLs must be publicly accessible for email embedding
- SMTP credentials stored securely in environment variables

## 📚 Additional Documentation

- `functions/README.md` - Cloud Functions documentation
- `functions/SMTP_CONFIG.md` - Email configuration guide
- `MEDIUM_PRIORITY_IMPLEMENTATION.md` - Implementation details
- `ENV_SETUP.md` - Environment setup guide
- `STORAGE_SETUP.md` - Storage configuration

