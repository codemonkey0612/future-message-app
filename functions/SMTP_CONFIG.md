# SMTP Configuration

## Current Configuration

Your custom SMTP server is configured with:

- **SMTP Host:** `smtp.futuremessage-app.com`
- **SMTP Port:** `587` (TLS)
- **Email Address:** `mail@futuremessage-app.com`
- **Email Password:** `mail-mht54354029` (stored securely in Firebase Functions config)

## Common SMTP Host Variations

If `smtp.futuremessage-app.com` doesn't work, try:

1. `mail.futuremessage-app.com` (most common)
2. `smtp.futuremessage-app.com` (current setting)
3. `mailhost.futuremessage-app.com`

## How to Change SMTP Host

If you need to change the SMTP host:

```bash
firebase functions:config:set smtp.host="mail.futuremessage-app.com"
```

Then redeploy:
```bash
firebase deploy --only functions
```

## Testing SMTP Connection

After deployment, test the email function:

```typescript
import { functions } from './services/firebase';

const sendEmail = functions.httpsCallable('sendEmailMessage');
await sendEmail({ 
  submissionId: 'test-submission-id', 
  campaignId: 'test-campaign-id' 
});
```

Check logs for any connection errors:
```bash
firebase functions:log
```

## Troubleshooting

### Connection Timeout
- Verify the SMTP host is correct
- Check if port 587 is open
- Try port 465 (SSL) instead

### Authentication Failed
- Verify email and password are correct
- Check if the email account is active
- Ensure the password doesn't have special characters that need escaping

### SSL/TLS Errors
- The code currently has `rejectUnauthorized: false` for testing
- In production, set to `true` if you have a valid SSL certificate

## Alternative Ports

If port 587 doesn't work, try:

- **Port 465** (SSL) - Update config:
  ```bash
  firebase functions:config:set smtp.port="465"
  ```

- **Port 25** (non-encrypted) - Not recommended for security

## Security Notes

⚠️ **Important:**
- The password is stored in Firebase Functions config (encrypted)
- Never commit passwords to Git
- Consider rotating passwords periodically
- The password is visible in Firebase console (admin access only)

