# Custom Domain Setup Guide

## Domain: futuremessage-app.com

### Step 1: Add Domain in Firebase Console

1. Go to Firebase Console: https://console.firebase.google.com/project/futuremessage-app/hosting
2. Click "Add custom domain"
3. Enter: `futuremessage-app.com`
4. Click "Continue"

### Step 2: Verify Domain Ownership

Firebase will provide you with DNS records to add. You'll need to add one of these:

**Option A: TXT Record (Recommended)**
- Type: `TXT`
- Name: `@` (or root domain)
- Value: (provided by Firebase)
- TTL: 3600 (or default)

**Option B: HTML File**
- Download the HTML file provided
- Upload it to your domain's root directory
- Accessible at: `http://futuremessage-app.com/.well-known/firebase-hosting-verification.html`

### Step 3: Add DNS Records

After verification, Firebase will provide DNS records to add:

#### A Record (for root domain)
- Type: `A`
- Name: `@` (or leave blank for root)
- Value: (IP addresses provided by Firebase - usually 2-4 addresses)
- TTL: 3600

#### AAAA Record (for IPv6 - optional but recommended)
- Type: `AAAA`
- Name: `@`
- Value: (IPv6 addresses provided by Firebase)
- TTL: 3600

### Step 4: Wait for SSL Certificate

- Firebase automatically provisions SSL certificates via Let's Encrypt
- This usually takes 5-60 minutes
- You'll receive an email when it's ready

### Step 5: Update Domain Configuration

Once SSL is ready, your domain will be active at:
- `https://futuremessage-app.com`
- `https://www.futuremessage-app.com` (if you add www subdomain)

## DNS Provider Instructions

### Common DNS Providers:

#### GoDaddy
1. Log in to GoDaddy
2. Go to "My Products" → "DNS"
3. Click "Add" to add new records
4. Add the A records provided by Firebase

#### Namecheap
1. Log in to Namecheap
2. Go to "Domain List" → Select domain → "Advanced DNS"
3. Add the A records in "Host Records"

#### Cloudflare
1. Log in to Cloudflare
2. Select your domain
3. Go to "DNS" → "Records"
4. Add A records (set proxy to "DNS only" initially)

#### Google Domains / Squarespace Domains
1. Log in to your domain provider
2. Go to DNS settings
3. Add the A records provided by Firebase

## Important Notes

1. **DNS Propagation**: Changes can take 24-48 hours to propagate globally
2. **SSL Certificate**: Firebase automatically handles SSL certificates
3. **www Subdomain**: You can add `www.futuremessage-app.com` separately if needed
4. **Both Domains**: You can have both `futuremessage-app.com` and `www.futuremessage-app.com` active

## Troubleshooting

### Domain not resolving?
- Wait 24-48 hours for DNS propagation
- Check DNS records are correct using: `nslookup futuremessage-app.com`
- Verify records in Firebase Console

### SSL Certificate issues?
- Wait up to 60 minutes for certificate provisioning
- Check Firebase Console for certificate status
- Ensure DNS records are correct

### Still using .web.app domain?
- The custom domain works alongside the .web.app domain
- Both will work after setup
- You can redirect .web.app to custom domain if desired

## After Setup

Once your domain is active:
1. Update any hardcoded URLs in your code
2. Update LINE callback URLs in LINE Developers Console
3. Test all routes work correctly
4. Update any documentation/bookmarks

