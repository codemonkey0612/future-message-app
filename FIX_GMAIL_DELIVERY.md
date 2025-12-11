# Fix Gmail Email Delivery Issue

## Problem
- ✅ Emails are received at `tajdine.elm@atomicmail.io`
- ❌ Emails are NOT received at `tajdine.elm@gmail.com` (not even in spam)
- ✅ SMTP server accepts emails: `250 2.0.0 Message accepted for delivery`

This indicates Gmail is blocking your emails before they reach the inbox.

## Why Gmail Blocks Emails

Gmail has strict spam filters and requires proper email authentication. Common reasons:

1. **Missing SPF Record** - Gmail checks if your domain authorizes the sending server
2. **Missing DKIM Signature** - Gmail verifies email authenticity
3. **Missing DMARC Policy** - Gmail checks domain-based message authentication
4. **Domain Reputation** - `futuremessage-app.com` might be on a blacklist
5. **IP Reputation** - Your SMTP server's IP might be blacklisted

## Solutions

### Solution 1: Check and Fix DNS Records (Recommended)

#### Step 1: Check Current SPF Record
```bash
dig TXT futuremessage-app.com
# or
nslookup -type=TXT futuremessage-app.com
```

**Should show something like:**
```
v=spf1 include:_spf.google.com ~all
# or
v=spf1 ip4:YOUR_SMTP_IP ~all
```

#### Step 2: Add/Update SPF Record
If missing or incorrect, add to your DNS:

**For custom SMTP server:**
```
Type: TXT
Name: futuremessage-app.com
Value: v=spf1 ip4:YOUR_SMTP_SERVER_IP ~all
```

**For Gmail/Google Workspace:**
```
Type: TXT
Name: futuremessage-app.com
Value: v=spf1 include:_spf.google.com ~all
```

#### Step 3: Set Up DKIM
1. Generate DKIM keys (your email provider should provide this)
2. Add DKIM record to DNS:
   ```
   Type: TXT
   Name: default._domainkey.futuremessage-app.com
   Value: (provided by your email provider)
   ```

#### Step 4: Set Up DMARC
```
Type: TXT
Name: _dmarc.futuremessage-app.com
Value: v=DMARC1; p=none; rua=mailto:admin@futuremessage-app.com
```

### Solution 2: Use Transactional Email Service (Easiest)

Instead of custom SMTP, use a service with better deliverability:

#### Option A: SendGrid
1. Sign up at https://sendgrid.com
2. Get API key
3. Update function to use SendGrid SMTP:
   - Host: `smtp.sendgrid.net`
   - Port: `587`
   - User: `apikey`
   - Password: Your SendGrid API key

#### Option B: Mailgun
1. Sign up at https://mailgun.com
2. Get SMTP credentials
3. Update function with Mailgun SMTP settings

#### Option C: AWS SES
1. Set up AWS SES
2. Verify domain
3. Use SES SMTP endpoint

### Solution 3: Check Domain Reputation

1. **Check Blacklists:**
   - https://mxtoolbox.com/blacklists.aspx
   - Enter: `futuremessage-app.com`
   - If blacklisted, request removal

2. **Check Domain Reputation:**
   - https://www.mail-tester.com/
   - Send test email and check score

### Solution 4: Use Gmail SMTP (For Testing)

If you have a Gmail account, you can use it for testing:

1. Enable 2-Factor Authentication
2. Generate App Password: https://myaccount.google.com/apppasswords
3. Set secrets:
   ```bash
   echo "smtp.gmail.com" | npx firebase-tools functions:secrets:set SMTP_HOST
   echo "587" | npx firebase-tools functions:secrets:set SMTP_PORT
   echo "your-email@gmail.com" | npx firebase-tools functions:secrets:set EMAIL_USER
   echo "your-16-char-app-password" | npx firebase-tools functions:secrets:set EMAIL_PASSWORD
   ```
4. Redeploy function

**Note**: Gmail has sending limits (500 emails/day for free accounts)

## Quick Test

After fixing DNS records, test with:
- https://www.mail-tester.com/ - Send test email and check score
- Should get 8-10/10 score for good deliverability

## Immediate Action

1. **Check SPF Record** (most important):
   ```bash
   dig TXT futuremessage-app.com
   ```

2. **If SPF is missing**, add it to your DNS immediately

3. **For production**, consider using SendGrid or Mailgun for better deliverability

## Why atomicmail.io Works But Gmail Doesn't

- **atomicmail.io** has less strict spam filters
- **Gmail** requires SPF/DKIM/DMARC for good deliverability
- Your SMTP server might not have proper authentication set up

## Next Steps

1. ✅ Check SPF record
2. ✅ Add SPF if missing
3. ✅ Set up DKIM (if possible)
4. ✅ Test with mail-tester.com
5. ✅ Consider using SendGrid/Mailgun for production

