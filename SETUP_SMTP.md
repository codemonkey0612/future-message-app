# Setup SMTP Configuration for Email Sending

## Problem
The error `getaddrinfo ENOTFOUND smtp.futuremessage-app.com` means the SMTP hostname doesn't exist. You need to configure a valid SMTP server.

## Solution: Set Environment Variables

Since we migrated from `functions.config()` to environment variables, you need to set them using Firebase Functions secrets.

### Option 1: Using Firebase CLI (Recommended)

Set each secret interactively:

```bash
# Set SMTP host (e.g., for Gmail: smtp.gmail.com, or your custom SMTP server)
npx firebase-tools functions:secrets:set SMTP_HOST

# Set SMTP port (587 for TLS, 465 for SSL)
npx firebase-tools functions:secrets:set SMTP_PORT

# Set email username
npx firebase-tools functions:secrets:set EMAIL_USER

# Set email password
npx firebase-tools functions:secrets:set EMAIL_PASSWORD
```

After setting secrets, you need to **update your function to use them** and redeploy:

```bash
firebase deploy --only functions:sendEmailMessage
```

### Option 2: Using Gmail SMTP (For Testing)

If you want to use Gmail for testing:

1. **Enable 2-Factor Authentication** on your Gmail account
2. **Generate an App Password**:
   - Go to: https://myaccount.google.com/apppasswords
   - Select "Mail" and "Other (Custom name)"
   - Enter "Firebase Functions"
   - Copy the 16-character password

3. **Set the secrets**:
   ```bash
   # SMTP Host
   echo "smtp.gmail.com" | npx firebase-tools functions:secrets:set SMTP_HOST
   
   # SMTP Port
   echo "587" | npx firebase-tools functions:secrets:set SMTP_PORT
   
   # Email User (your Gmail address)
   echo "your-email@gmail.com" | npx firebase-tools functions:secrets:set EMAIL_USER
   
   # Email Password (the 16-character app password)
   echo "your-app-password" | npx firebase-tools functions:secrets:set EMAIL_PASSWORD
   ```

4. **Redeploy the function**:
   ```bash
   firebase deploy --only functions:sendEmailMessage
   ```

### Option 3: Using Your Custom SMTP Server

If you have your own SMTP server (like the one mentioned in SMTP_CONFIG.md):

1. **Find the correct SMTP hostname**:
   - Try: `mail.futuremessage-app.com`
   - Or: `smtp.futuremessage-app.com`
   - Or: `mailhost.futuremessage-app.com`
   - Check with your hosting provider

2. **Set the secrets**:
   ```bash
   echo "mail.futuremessage-app.com" | npx firebase-tools functions:secrets:set SMTP_HOST
   echo "587" | npx firebase-tools functions:secrets:set SMTP_PORT
   echo "mail@futuremessage-app.com" | npx firebase-tools functions:secrets:set EMAIL_USER
   echo "your-actual-password" | npx firebase-tools functions:secrets:set EMAIL_PASSWORD
   ```

3. **Redeploy**:
   ```bash
   firebase deploy --only functions:sendEmailMessage
   ```

## Verify Configuration

After setting secrets and redeploying, test again with Postman:

```
POST https://asia-northeast1-futuremessage-app.cloudfunctions.net/sendEmailMessage
Content-Type: application/json

{
  "data": {
    "submissionId": "mJKdUbfV7JqIPfwcGml7",
    "campaignId": "RbMRrJTZJDxnIYEu48cg"
  }
}
```

## Check Logs

If there are still errors, check the function logs:

```bash
npx firebase-tools functions:log --only sendEmailMessage --region asia-northeast1
```

## Common SMTP Providers

### Gmail
- Host: `smtp.gmail.com`
- Port: `587` (TLS) or `465` (SSL)
- Requires: App Password (not regular password)

### Outlook/Hotmail
- Host: `smtp-mail.outlook.com`
- Port: `587`
- Requires: App Password

### SendGrid
- Host: `smtp.sendgrid.net`
- Port: `587`
- User: `apikey`
- Password: Your SendGrid API key

### Mailgun
- Host: `smtp.mailgun.org`
- Port: `587`
- User: Your Mailgun SMTP username
- Password: Your Mailgun SMTP password

## Important Notes

1. **Secrets are encrypted** and stored securely in Google Secret Manager
2. **After setting secrets, you MUST redeploy** the function for changes to take effect
3. **The function code reads from `process.env.SMTP_HOST`**, so secrets are automatically available as environment variables
4. **Never commit passwords to Git** - always use secrets

