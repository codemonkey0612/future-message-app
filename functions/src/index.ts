import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const nodemailer = require("nodemailer");

admin.initializeApp();

// Initialize email transporter with custom SMTP configuration
// Configuration is set via environment variables:
// firebase functions:secrets:set SMTP_HOST
// firebase functions:secrets:set SMTP_PORT
// firebase functions:secrets:set EMAIL_USER
// firebase functions:secrets:set EMAIL_PASSWORD
// Or set them in .env file for local development
const getEmailTransporter = () => {
  const smtpHost = process.env.SMTP_HOST || "smtp.futuremessage-app.com";
  const smtpPort = parseInt(process.env.SMTP_PORT || "587");
  const smtpSecure = smtpPort === 465; // SSL uses port 465
  
  return nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpSecure, // true for 465, false for other ports
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD,
    },
    // TLS options for port 587
    ...(smtpPort === 587 && {
      tls: {
        rejectUnauthorized: false, // Set to true in production with valid SSL certificate
      },
    }),
  });
};

/**
 * Exchange LINE OAuth authorization code for access token
 * This keeps the LINE Channel Secret secure on the server
 */
/**
 * Exchange LINE OAuth authorization code for access token
 * Using onRequest instead of onCall to avoid region/CORS issues with Firebase v8
 */
export const exchangeLineToken = functions.region('asia-northeast1').https.onRequest(async (req, res) => {
  // Enable CORS
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight request
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  // Only allow POST
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { code, redirectUri, campaignId } = req.body as { code?: string; redirectUri?: string; campaignId?: string };

    // Validate input
    if (!code || !redirectUri || !campaignId) {
      res.status(400).json({
        error: "invalid-argument",
        message: "Missing required parameters: code, redirectUri, or campaignId"
      });
      return;
    }

    // Get campaign from Firestore to retrieve LINE credentials
    const campaignDoc = await admin.firestore().collection("campaigns").doc(campaignId).get();
    
    if (!campaignDoc.exists) {
      res.status(404).json({
        error: "not-found",
        message: "Campaign not found"
      });
      return;
    }

    const campaign = campaignDoc.data();
    
    if (!campaign?.lineChannelId || !campaign?.lineChannelSecret) {
      res.status(400).json({
        error: "failed-precondition",
        message: "Campaign LINE configuration is incomplete"
      });
      return;
    }

    // Exchange authorization code for access token
    const tokenResponse = await fetch("https://api.line.me/oauth2/v2.1/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: campaign.lineChannelId,
        client_secret: campaign.lineChannelSecret,
      }),
    });

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok || !tokenData.id_token) {
      res.status(500).json({
        error: "internal",
        message: tokenData.error_description || "Failed to exchange LINE token"
      });
      return;
    }

    // Decode ID token to get user ID
    const idTokenPayload = JSON.parse(
      Buffer.from(tokenData.id_token.split(".")[1], "base64").toString()
    );
    const lineUserId = idTokenPayload.sub;

    if (!lineUserId) {
      res.status(500).json({
        error: "internal",
        message: "Failed to extract LINE user ID from token"
      });
      return;
    }

    // Return the LINE user ID (don't return the full token for security)
    res.status(200).json({
      lineUserId,
      success: true,
    });
  } catch (error: any) {
    console.error("LINE token exchange error:", error);
    res.status(500).json({
      error: "internal",
      message: error.message || "An error occurred during LINE token exchange"
    });
  }
});

/**
 * Helper function to send email message
 * Can be called from both HTTP callable and scheduled functions
 */
async function sendEmailHelper(submissionId: string, campaignId: string): Promise<void> {
  // Get submission and campaign from Firestore
  const [submissionDoc, campaignDoc] = await Promise.all([
    admin.firestore().collection("submissions").doc(submissionId).get(),
    admin.firestore().collection("campaigns").doc(campaignId).get(),
  ]);

  if (!submissionDoc.exists || !campaignDoc.exists) {
    throw new Error("Submission or campaign not found");
  }

  const submission = submissionDoc.data();
  const campaign = campaignDoc.data();

  if (!submission || !campaign) {
    throw new Error("Data not found");
  }

  // Check if delivery channel is email
  // Allow if either campaign.deliveryChannel is "email" OR submission.deliveryChoice is "email"
  if (campaign.deliveryChannel !== "email" && submission.deliveryChoice !== "email") {
    throw new Error(`This submission is not configured for email delivery. Campaign channel: ${campaign.deliveryChannel}, Submission choice: ${submission.deliveryChoice}`);
  }

  // Get email template from campaign
  const emailTemplate = campaign.emailTemplate || {
    subject: "未来へのメッセージ",
    body: submission.formData?.message || "",
  };

  // Prepare email content
  const emailSubject = emailTemplate.subject || "未来へのメッセージ";
  let emailBody = emailTemplate.body || "";
  
  // If email body is empty, use the message from form data
  if (!emailBody || emailBody.trim() === "") {
    emailBody = submission.formData?.message || "未来へのメッセージ";
  }
  
  console.log(`[sendEmailHelper] Email body before replacement:`, emailBody.substring(0, 100));

  // Replace placeholders in email body
  // Handle submittedAt - could be ISO string or Firestore Timestamp
  let submittedAtDate: Date;
  if (submission.submittedAt instanceof admin.firestore.Timestamp) {
    submittedAtDate = submission.submittedAt.toDate();
  } else if (typeof submission.submittedAt === "string") {
    submittedAtDate = new Date(submission.submittedAt);
  } else {
    submittedAtDate = new Date();
  }
  
  // Replace placeholders in email body
  // First replace standard fields
  emailBody = emailBody
    .replace(/\{message\}/g, submission.formData?.message || "")
    .replace(/\{email\}/g, submission.formData?.email || "")
    .replace(/\{submittedAt\}/g, submittedAtDate.toLocaleString("ja-JP"));
  
  // Replace all custom form fields
  if (submission.formData) {
    for (const [key, value] of Object.entries(submission.formData)) {
      // Skip imageUrl as it's handled separately
      if (key !== 'imageUrl' && value !== undefined && value !== null) {
        const placeholder = `{${key}}`;
        const stringValue = String(value);
        emailBody = emailBody.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'), stringValue);
      }
    }
  }
  
  // If no placeholders were used, append all form field data at the end
  if (!emailBody.includes('{') && submission.formData) {
    const formFieldsText: string[] = [];
    for (const [key, value] of Object.entries(submission.formData)) {
      if (key !== 'imageUrl' && value !== undefined && value !== null && value !== '') {
        // Convert key to readable label (capitalize first letter)
        const label = key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1');
        formFieldsText.push(`${label}: ${value}`);
      }
    }
    if (formFieldsText.length > 0) {
      emailBody += "\n\n" + formFieldsText.join("\n");
    }
  }
  
  console.log(`[sendEmailHelper] Email body after replacement:`, emailBody.substring(0, 200));
  console.log(`[sendEmailHelper] Message from formData:`, submission.formData?.message?.substring(0, 100));
  console.log(`[sendEmailHelper] Image URL present:`, !!submission.formData?.imageUrl);

  // Validate recipient email
  const recipientEmail = submission.formData?.email;
  if (!recipientEmail || typeof recipientEmail !== "string" || !recipientEmail.includes("@")) {
    throw new Error("Invalid or missing recipient email address");
  }

  // Send email
  const fromEmail = campaign.settings?.form?.fromEmail || 
                   process.env.EMAIL_USER || 
                   "mail@futuremessage-app.com";
  
  // Prepare HTML body with proper structure
  // Convert newlines to <br> and wrap in proper HTML structure
  let htmlBody = emailBody.replace(/\n/g, "<br>");
  
  // Handle image - download from Firebase Storage URL and attach if needed
  const attachments: any[] = [];
  let imageCid: string | null = null;
  
  if (submission.formData?.imageUrl) {
    const imageUrl = submission.formData.imageUrl;
    
    try {
      // Skip blob: URLs - they won't work in emails (temporary browser URLs)
      if (imageUrl.startsWith('blob:')) {
        console.warn(`[sendEmailHelper] Skipping blob: URL - cannot be used in emails`);
        htmlBody += `<br><br><div style="text-align: center; margin: 20px 0; padding: 20px; background-color: #f3f4f6; border-radius: 8px; color: #6b7280;">画像は添付されていますが、プレビューを表示できませんでした。</div>`;
      }
      // Check if it's a data URL (base64) - for backward compatibility
      else if (imageUrl.startsWith('data:image/')) {
        // Extract MIME type and base64 data
        const matches = imageUrl.match(/^data:image\/(\w+);base64,(.+)$/);
        if (matches) {
          const mimeType = matches[1];
          const base64Data = matches[2];
          
          // Check size - if base64 is too large, email might be rejected
          const base64Size = base64Data.length * 3 / 4; // Approximate binary size
          const maxSize = 3 * 1024 * 1024; // 3MB limit for email attachments
          
          if (base64Size > maxSize) {
            console.warn(`[sendEmailHelper] Image too large (${Math.round(base64Size / 1024)}KB), cannot attach`);
            htmlBody += `<br><br><div style="text-align: center; margin: 20px 0; padding: 20px; background-color: #fef3c7; border-radius: 8px; color: #92400e;">画像が大きすぎるため、添付できませんでした。</div>`;
          } else {
            const buffer = Buffer.from(base64Data, 'base64');
            
            // Generate a unique CID for the image
            imageCid = `message-image-${submissionId}`;
            
            // Add as attachment with CID
            attachments.push({
              filename: `message-image.${mimeType}`,
              content: buffer,
              cid: imageCid,
              contentType: `image/${mimeType}`,
            });
            
            // Reference in HTML using CID
            htmlBody += `<br><br><div style="text-align: center; margin: 20px 0;"><img src="cid:${imageCid}" alt="Message image" style="max-width: 100%; height: auto; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);"></div>`;
            
            console.log(`[sendEmailHelper] Converting data URL to attachment with CID: ${imageCid}, size: ${Math.round(buffer.length / 1024)}KB`);
          }
        } else {
          console.warn(`[sendEmailHelper] Invalid data URL format`);
          htmlBody += `<br><br><div style="text-align: center; margin: 20px 0; padding: 20px; background-color: #fee2e2; border-radius: 8px; color: #991b1b;">画像の形式が正しくありませんでした。</div>`;
        }
      } 
      // Firebase Storage URL or regular HTTP/HTTPS URL - download and attach
      else if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
        try {
          console.log(`[sendEmailHelper] Attempting to download image from: ${imageUrl.substring(0, 100)}...`);
          
          // Fetch the image with a timeout
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
          
          const imageResponse = await fetch(imageUrl, {
            signal: controller.signal,
            headers: {
              'User-Agent': 'FutureMessageApp/1.0'
            }
          });
          
          clearTimeout(timeoutId);
          
          if (imageResponse.ok) {
            const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
            const contentType = imageResponse.headers.get('content-type') || 'image/jpeg';
            
            console.log(`[sendEmailHelper] Image downloaded successfully, size: ${Math.round(imageBuffer.length / 1024)}KB, content-type: ${contentType}`);
            
            // Check size before attaching
            const maxSize = 3 * 1024 * 1024; // 3MB limit
            if (imageBuffer.length > maxSize) {
              console.warn(`[sendEmailHelper] Image too large (${Math.round(imageBuffer.length / 1024)}KB), cannot attach`);
              htmlBody += `<br><br><div style="text-align: center; margin: 20px 0; padding: 20px; background-color: #fef3c7; border-radius: 8px; color: #92400e;">画像が大きすぎるため、添付できませんでした。</div>`;
            } else if (imageBuffer.length === 0) {
              console.warn(`[sendEmailHelper] Image buffer is empty`);
              htmlBody += `<br><br><div style="text-align: center; margin: 20px 0; padding: 20px; background-color: #fee2e2; border-radius: 8px; color: #991b1b;">画像のダウンロードに失敗しました。</div>`;
            } else {
              // Determine file extension from content type or URL
              let ext = 'jpg';
              if (contentType.includes('png')) ext = 'png';
              else if (contentType.includes('gif')) ext = 'gif';
              else if (contentType.includes('webp')) ext = 'webp';
              else {
                // Try to get extension from URL
                const urlMatch = imageUrl.match(/\.(jpg|jpeg|png|gif|webp)(\?|$)/i);
                if (urlMatch) ext = urlMatch[1].toLowerCase();
              }
              
              // Generate a unique CID for the image
              imageCid = `message-image-${submissionId}`;
              
              // Add as attachment with CID
              attachments.push({
                filename: `message-image.${ext}`,
                content: imageBuffer,
                cid: imageCid,
                contentType: contentType,
              });
              
              // Reference in HTML using CID
              htmlBody += `<br><br><div style="text-align: center; margin: 20px 0;"><img src="cid:${imageCid}" alt="Message image" style="max-width: 100%; height: auto; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);"></div>`;
              
              console.log(`[sendEmailHelper] Successfully attached image with CID: ${imageCid}`);
            }
          } else {
            console.error(`[sendEmailHelper] Failed to download image: HTTP ${imageResponse.status} ${imageResponse.statusText}`);
            htmlBody += `<br><br><div style="text-align: center; margin: 20px 0; padding: 20px; background-color: #fee2e2; border-radius: 8px; color: #991b1b;">画像のダウンロードに失敗しました (HTTP ${imageResponse.status})。</div>`;
          }
        } catch (fetchError: any) {
          // If fetch fails, log error but don't use URL directly (email clients block external images)
          console.error(`[sendEmailHelper] Error downloading image:`, fetchError.message || fetchError);
          htmlBody += `<br><br><div style="text-align: center; margin: 20px 0; padding: 20px; background-color: #fee2e2; border-radius: 8px; color: #991b1b;">画像の取得に失敗しました: ${fetchError.message || 'Unknown error'}。</div>`;
        }
      } else {
        console.warn(`[sendEmailHelper] Unsupported image URL format: ${imageUrl.substring(0, 50)}`);
        htmlBody += `<br><br><div style="text-align: center; margin: 20px 0; padding: 20px; background-color: #fef3c7; border-radius: 8px; color: #92400e;">画像URLの形式がサポートされていません。</div>`;
      }
    } catch (error: any) {
      console.error(`[sendEmailHelper] Unexpected error processing image:`, error);
      htmlBody += `<br><br><div style="text-align: center; margin: 20px 0; padding: 20px; background-color: #fee2e2; border-radius: 8px; color: #991b1b;">画像の処理中にエラーが発生しました。</div>`;
    }
  }
  
  // Wrap in proper HTML structure for better email client compatibility
  const fullHtmlBody = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background-color: #ffffff; padding: 20px; border-radius: 8px;">
        ${htmlBody}
      </div>
    </body>
    </html>
  `;
  
  // Prepare text version - include image note if available
  let textBody = emailBody.replace(/<br>/g, '\n').replace(/<[^>]*>/g, '');
  if (submission.formData?.imageUrl) {
    textBody += `\n\n[画像が添付されています]`;
  }
  
  const mailOptions = {
    from: `"${campaign.name || 'Future Message App'}" <${fromEmail}>`,
    to: recipientEmail,
    subject: emailSubject,
    html: fullHtmlBody,
    text: textBody,
    attachments: attachments.length > 0 ? attachments : undefined,
    // Add headers to improve deliverability
    headers: {
      'X-Priority': '1',
      'X-MSMail-Priority': 'High',
      'Importance': 'high',
    },
  };

  // Create transporter on each call to use current environment variables
  const emailTransporter = getEmailTransporter();
  
  // Log email attempt for debugging
  console.log(`[sendEmailHelper] Attempting to send email to ${recipientEmail} from ${fromEmail}`);
  console.log(`[sendEmailHelper] Email subject: ${emailSubject}`);
  console.log(`[sendEmailHelper] SMTP config: host=${process.env.SMTP_HOST || 'NOT SET'}, port=${process.env.SMTP_PORT || 'NOT SET'}, user=${process.env.EMAIL_USER ? 'SET' : 'NOT SET'}`);
  
  try {
    const info = await emailTransporter.sendMail(mailOptions);
    console.log(`Email sent successfully:`, {
      messageId: info.messageId,
      response: info.response,
      accepted: info.accepted,
      rejected: info.rejected,
    });
    
    // Verify email was actually accepted
    if (info.rejected && info.rejected.length > 0) {
      throw new Error(`Email was rejected by SMTP server: ${info.rejected.join(", ")}`);
    }
    
    if (!info.messageId) {
      throw new Error("Email send completed but no messageId returned - email may not have been sent");
    }
  } catch (error: any) {
    console.error("Error sending email:", {
      error: error.message,
      code: error.code,
      command: error.command,
      response: error.response,
      responseCode: error.responseCode,
    });
    throw error;
  }

  // Mark submission as delivered only after successful send
  // IMPORTANT: Keep deliveredAt as the scheduled time (don't overwrite it)
  // The scheduled function uses deliveredAt to determine when to send
  // We only update delivered to true, and add actualDeliveredAt for tracking
  const actualDeliveryTime = admin.firestore.Timestamp.now();
  const updateData: any = {
    delivered: true,
    actualDeliveredAt: actualDeliveryTime, // Track when email was actually sent
    // deliveredAt remains as the scheduled time (DO NOT UPDATE)
  };
  
  console.log(`[sendEmailHelper] Updating submission ${submissionId} with delivered=true, actualDeliveredAt=${actualDeliveryTime.toDate().toISOString()}`);
  console.log(`[sendEmailHelper] Keeping deliveredAt as scheduled time (not updating)`);
  await submissionDoc.ref.update(updateData);
  
  // Verify the update was successful
  const updatedDoc = await submissionDoc.ref.get();
  const updatedData = updatedDoc.data();
  console.log(`[sendEmailHelper] After update - delivered: ${updatedData?.delivered}, deliveredAt (scheduled): ${updatedData?.deliveredAt ? (updatedData.deliveredAt.toDate ? updatedData.deliveredAt.toDate().toISOString() : updatedData.deliveredAt) : 'MISSING'}, actualDeliveredAt: ${updatedData?.actualDeliveredAt ? (updatedData.actualDeliveredAt.toDate ? updatedData.actualDeliveredAt.toDate().toISOString() : updatedData.actualDeliveredAt) : 'MISSING'}`);
  console.log(`[sendEmailHelper] Successfully updated submission ${submissionId}`);
}

/**
 * Send email message to user
 * Triggered by scheduled function or manually
 */
export const sendEmailMessage = functions.region('asia-northeast1').https.onCall(async (data, context) => {
  const { submissionId, campaignId } = data as { submissionId?: string; campaignId?: string };

  if (!submissionId || !campaignId) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Missing required parameters: submissionId or campaignId"
    );
  }

  try {
    await sendEmailHelper(submissionId, campaignId);
    return { success: true, message: "Email sent successfully" };
  } catch (error: any) {
    console.error("Email delivery error:", error);
    throw new functions.https.HttpsError(
      "internal",
      error.message || "Failed to send email"
    );
  }
});

/**
 * Helper function to send LINE message
 * Can be called from both HTTP callable and scheduled functions
 */
async function sendLineHelper(submissionId: string, campaignId: string): Promise<void> {
  // Get submission and campaign from Firestore
  const [submissionDoc, campaignDoc] = await Promise.all([
    admin.firestore().collection("submissions").doc(submissionId).get(),
    admin.firestore().collection("campaigns").doc(campaignId).get(),
  ]);

  if (!submissionDoc.exists || !campaignDoc.exists) {
    throw new Error("Submission or campaign not found");
  }

  const submission = submissionDoc.data();
  const campaign = campaignDoc.data();

  if (!submission || !campaign) {
    throw new Error("Data not found");
  }

  // Check if delivery channel is LINE
  if (campaign.deliveryChannel !== "line" && submission.deliveryChoice !== "line") {
    throw new Error("This submission is not configured for LINE delivery");
  }

  // Get LINE user ID from formData.lineId (entered by user)
  // Note: This is the LINE User ID that the user enters in the form.
  // The LINE User ID must belong to an account that has added the LINE bot as a friend.
  // To test: Get your LINE User ID from LINE Developers Console or by having a user message your bot.
  console.log('[sendLineHelper] Submission formData:', JSON.stringify(submission.formData, null, 2));
  const lineUserId = submission.formData?.lineId;
  console.log('[sendLineHelper] Extracted LINE user ID:', lineUserId);
  
  if (!lineUserId || typeof lineUserId !== 'string' || !lineUserId.trim()) {
    console.error('[sendLineHelper] LINE user ID is missing or invalid:', lineUserId);
    throw new Error("LINE user ID not found in submission formData or is invalid");
  }
  
  // Trim and use the LINE user ID
  // LINE User IDs typically start with 'U' followed by alphanumeric characters
  const trimmedLineUserId = lineUserId.trim();
  console.log('[sendLineHelper] Using trimmed LINE user ID:', trimmedLineUserId);

  if (!campaign.lineChannelId || !campaign.lineChannelSecret) {
    throw new Error("Campaign LINE configuration is incomplete");
  }

  // Get LINE access token
  const tokenResponse = await fetch("https://api.line.me/oauth2/v2.1/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: campaign.lineChannelId,
      client_secret: campaign.lineChannelSecret,
    }),
  });

  const tokenData = await tokenResponse.json();

  if (!tokenResponse.ok || !tokenData.access_token) {
    throw new Error("Failed to get LINE access token");
  }

  // Prepare message content - use the actual form data message
  // Include all form fields similar to email
  let lineMessage = submission.formData?.message || "未来へのメッセージ";
  
  // Add custom form fields to the message
  if (submission.formData) {
    const formFieldsText: string[] = [];
    for (const [key, value] of Object.entries(submission.formData)) {
      if (key !== 'imageUrl' && key !== 'message' && value !== undefined && value !== null && value !== '') {
        // Convert key to readable label
        const label = key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1');
        formFieldsText.push(`${label}: ${value}`);
      }
    }
    if (formFieldsText.length > 0) {
      lineMessage += "\n\n" + formFieldsText.join("\n");
    }
  }
  
  // If campaign has a custom LINE message template, use it and replace placeholders
  if (campaign.lineMessage) {
    let templateMessage = campaign.lineMessage;
    // Replace placeholders
    templateMessage = templateMessage.replace(/\{message\}/g, submission.formData?.message || "");
    if (submission.formData) {
      for (const [key, value] of Object.entries(submission.formData)) {
        if (key !== 'imageUrl' && value !== undefined && value !== null) {
          const placeholder = `{${key}}`;
          templateMessage = templateMessage.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'), String(value));
        }
      }
    }
    lineMessage = templateMessage;
  }

  // Prepare messages array
  const messages: any[] = [
    {
      type: "text",
      text: lineMessage,
    },
  ];

  // Handle image if available
  if (submission.formData?.imageUrl) {
    const imageUrl = submission.formData.imageUrl;
    
    try {
      // Skip blob: URLs - they won't work (temporary browser URLs)
      if (imageUrl.startsWith('blob:')) {
        console.warn(`[sendLineHelper] Skipping blob: URL - cannot be used in LINE messages`);
      }
      // For data URLs - these should have been uploaded to Firebase Storage already
      // But for backward compatibility, we'll skip them with a warning
      else if (imageUrl.startsWith('data:image/')) {
        console.warn(`[sendLineHelper] Data URL found - images should be uploaded to Firebase Storage. Skipping image.`);
        // Note: In production, formData.imageUrl should always be a Firebase Storage URL
        // If we see data URLs here, it means old submissions or the upload failed
      }
      // For HTTPS URLs (Firebase Storage), use them directly
      // LINE API requires publicly accessible HTTPS URLs (not HTTP)
      else if (imageUrl.startsWith('https://')) {
        // Verify the URL is accessible and is HTTPS
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
          
          const testResponse = await fetch(imageUrl, { 
            method: 'HEAD', 
            signal: controller.signal,
            headers: {
              'User-Agent': 'FutureMessageApp/1.0'
            }
          });
          
          clearTimeout(timeoutId);
          
          if (testResponse.ok) {
            const contentType = testResponse.headers.get('content-type') || '';
            // LINE supports JPEG and PNG
            if (contentType.includes('image/jpeg') || contentType.includes('image/png') || contentType.includes('image/')) {
              messages.push({
                type: "image",
                originalContentUrl: imageUrl,
                previewImageUrl: imageUrl, // Use same URL for preview
              });
              console.log(`[sendLineHelper] Added image to LINE message: ${imageUrl.substring(0, 100)}...`);
            } else {
              console.warn(`[sendLineHelper] Image content type not supported by LINE: ${contentType}`);
            }
          } else {
            console.warn(`[sendLineHelper] Image URL not accessible (HTTP ${testResponse.status}), skipping image`);
          }
        } catch (fetchError: any) {
          console.warn(`[sendLineHelper] Could not verify image URL accessibility: ${fetchError.message || fetchError}, skipping image`);
        }
      } 
      // HTTP URLs are not supported by LINE API (must be HTTPS)
      else if (imageUrl.startsWith('http://')) {
        console.warn(`[sendLineHelper] HTTP URLs not supported by LINE API (must be HTTPS), skipping image`);
      } else {
        console.warn(`[sendLineHelper] Unsupported image URL format: ${imageUrl.substring(0, 50)}`);
      }
    } catch (error) {
      console.error(`[sendLineHelper] Error processing image:`, error);
      // Continue without image if there's an error
    }
  }

  // Send LINE message using Push Message API
  console.log(`[sendLineHelper] Sending LINE message to user ${trimmedLineUserId} with ${messages.length} message(s)`);
  const messageResponse = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${tokenData.access_token}`,
    },
    body: JSON.stringify({
      to: trimmedLineUserId,
      messages: messages,
    }),
  });

  if (!messageResponse.ok) {
    const errorData = await messageResponse.json();
    throw new Error(errorData.message || "Failed to send LINE message");
  }

  // Mark submission as delivered
  // IMPORTANT: Keep deliveredAt as the scheduled time (don't overwrite it)
  // The scheduled function uses deliveredAt to determine when to send
  // We only update delivered to true, and add actualDeliveredAt for tracking
  const actualDeliveryTime = admin.firestore.Timestamp.now();
  await submissionDoc.ref.update({
    delivered: true,
    actualDeliveredAt: actualDeliveryTime, // Track when LINE message was actually sent
    // deliveredAt remains as the scheduled time (DO NOT UPDATE)
  });
  console.log(`[sendLineHelper] Updated submission ${submissionId} with delivered=true, actualDeliveredAt=${actualDeliveryTime.toDate().toISOString()}`);
  console.log(`[sendLineHelper] Keeping deliveredAt as scheduled time (not updating)`);
}

/**
 * Send LINE message to user
 * Triggered by scheduled function or manually
 */
export const sendLineMessage = functions.region('asia-northeast1').https.onCall(async (data, context) => {
  const { submissionId, campaignId } = data as { submissionId?: string; campaignId?: string };

  if (!submissionId || !campaignId) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Missing required parameters: submissionId or campaignId"
    );
  }

  try {
    await sendLineHelper(submissionId, campaignId);
    return { success: true, message: "LINE message sent successfully" };
  } catch (error: any) {
    console.error("LINE delivery error:", error);
    throw new functions.https.HttpsError(
      "internal",
      error.message || "Failed to send LINE message"
    );
  }
});

/**
 * Scheduled function to process pending message deliveries
 * Runs daily to check for messages that need to be delivered
 */
export const processScheduledDeliveries = functions.region('asia-northeast1').pubsub
  .schedule("every 10 minutes")
  .timeZone("Asia/Tokyo")
  .onRun(async (context) => {
    try {
      const now = admin.firestore.Timestamp.now();
      console.log(`[processScheduledDeliveries] Started at ${now.toDate().toISOString()}`);
      
      // Get all campaigns with pending deliveries
      const campaignsSnapshot = await admin
        .firestore()
        .collection("campaigns")
        .where("deliveryType", "in", ["datetime", "interval"])
        .get();

      console.log(`[processScheduledDeliveries] Found ${campaignsSnapshot.docs.length} campaigns with scheduled delivery`);

      const deliveryPromises: Promise<void>[] = [];

      for (const campaignDoc of campaignsSnapshot.docs) {
        const campaign = campaignDoc.data();
        const campaignId = campaignDoc.id;

        console.log(`[processScheduledDeliveries] Processing campaign ${campaignId}, deliveryType: ${campaign.deliveryType}, deliveryChannel: ${campaign.deliveryChannel}`);

        // Get all undelivered submissions for this campaign
        // Query for submissions where delivered is false OR doesn't exist
        const allSubmissionsSnapshot = await admin
          .firestore()
          .collection("submissions")
          .where("campaignId", "==", campaignId)
          .get();
        
        // Filter to only get undelivered submissions (delivered === false or field doesn't exist)
        const undeliveredSubmissions = allSubmissionsSnapshot.docs.filter(doc => {
          const data = doc.data();
          return data.delivered !== true; // Include if delivered is false, undefined, or null
        });

        console.log(`[processScheduledDeliveries] Campaign ${campaignId}: ${undeliveredSubmissions.length} undelivered submissions out of ${allSubmissionsSnapshot.docs.length} total`);

        // Log all submissions for debugging
        for (const subDoc of allSubmissionsSnapshot.docs) {
          const subData = subDoc.data();
          console.log(`[processScheduledDeliveries] Submission ${subDoc.id}: email=${subData.formData?.email}, delivered=${subData.delivered}, deliveryChoice=${subData.deliveryChoice}`);
        }

        for (const submissionDoc of undeliveredSubmissions) {
          const submission = submissionDoc.data();
          const submissionId = submissionDoc.id;

          console.log(`[processScheduledDeliveries] Checking submission ${submissionId}: email=${submission.formData?.email}, deliveryChoice=${submission.deliveryChoice}, campaign.deliveryChannel=${campaign.deliveryChannel}`);
          console.log(`[processScheduledDeliveries] Submission ${submissionId} deliveredAt:`, submission.deliveredAt, 'type:', submission.deliveredAt ? (submission.deliveredAt instanceof admin.firestore.Timestamp ? 'Timestamp' : typeof submission.deliveredAt) : 'undefined');

          let shouldDeliver = false;
          let deliveryTime: admin.firestore.Timestamp | null = null;

          // PRIORITY 1: Check if submission has deliveredAt set (scheduled delivery time set when submission was created)
          // This is the preferred method - always use deliveredAt if it exists
          // IMPORTANT: deliveredAt is the SCHEDULED time, not the actual delivery time
          // Check Timestamp first (most common case now)
          if (submission.deliveredAt) {
            if (submission.deliveredAt instanceof admin.firestore.Timestamp) {
              // If deliveredAt is already a Timestamp (from Firestore), use it directly
              deliveryTime = submission.deliveredAt;
              // Only deliver if current time is >= scheduled time AND not already delivered
              shouldDeliver = now.toMillis() >= deliveryTime.toMillis() && submission.delivered !== true;
              console.log(`[processScheduledDeliveries] Submission ${submissionId}: Using deliveredAt (scheduled time, Timestamp)=${deliveryTime.toDate().toISOString()}, now=${now.toDate().toISOString()}, delivered=${submission.delivered}, shouldDeliver=${shouldDeliver}`);
            } else if (typeof submission.deliveredAt === 'string') {
              // If deliveredAt is a string, parse it
              const scheduledDate = new Date(submission.deliveredAt);
              deliveryTime = admin.firestore.Timestamp.fromDate(scheduledDate);
              // Only deliver if current time is >= scheduled time AND not already delivered
              shouldDeliver = now.toMillis() >= deliveryTime.toMillis() && submission.delivered !== true;
              console.log(`[processScheduledDeliveries] Submission ${submissionId}: Using deliveredAt (scheduled time, string)=${deliveryTime.toDate().toISOString()}, now=${now.toDate().toISOString()}, delivered=${submission.delivered}, shouldDeliver=${shouldDeliver}`);
            } else {
              console.log(`[processScheduledDeliveries] Submission ${submissionId}: deliveredAt exists but is not a Timestamp or string, type=${typeof submission.deliveredAt}, value=${JSON.stringify(submission.deliveredAt)}`);
            }
          } else {
            console.log(`[processScheduledDeliveries] Submission ${submissionId}: No deliveredAt field found, will use campaign settings`);
          }
          
          // PRIORITY 2: If deliveredAt is not set, calculate delivery time based on campaign type (backward compatibility)
          if (!deliveryTime && campaign.deliveryType === "datetime" && campaign.deliveryDateTime) {
            // Parse deliveryDateTime - handle both ISO strings and Firestore Timestamps
            let deliveryDate: Date;
            if (campaign.deliveryDateTime instanceof admin.firestore.Timestamp) {
              deliveryDate = campaign.deliveryDateTime.toDate();
            } else if (typeof campaign.deliveryDateTime === "string") {
              // If string doesn't have timezone, assume it's in Asia/Tokyo timezone
              const dateStr = campaign.deliveryDateTime;
              // If format is "YYYY-MM-DDTHH:mm" without timezone, add timezone
              if (dateStr.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)) {
                // Assume Asia/Tokyo timezone (UTC+9)
                deliveryDate = new Date(dateStr + "+09:00");
              } else {
                deliveryDate = new Date(dateStr);
              }
            } else {
              deliveryDate = new Date(campaign.deliveryDateTime);
            }
            deliveryTime = admin.firestore.Timestamp.fromDate(deliveryDate);
            shouldDeliver = now.toMillis() >= deliveryTime.toMillis();
            
            console.log(`[processScheduledDeliveries] Submission ${submissionId}: deliveryTime=${deliveryTime.toDate().toISOString()}, now=${now.toDate().toISOString()}, shouldDeliver=${shouldDeliver}`);
          } else if (
            campaign.deliveryType === "interval" &&
            campaign.deliveryIntervalDays
          ) {
            // Handle submittedAt - could be ISO string or Firestore Timestamp
            let submissionTime: admin.firestore.Timestamp;
            if (submission.submittedAt instanceof admin.firestore.Timestamp) {
              submissionTime = submission.submittedAt;
            } else if (typeof submission.submittedAt === "string") {
              submissionTime = admin.firestore.Timestamp.fromDate(
                new Date(submission.submittedAt)
              );
            } else {
              // Fallback to current time if invalid
              submissionTime = now;
            }
            
            deliveryTime = admin.firestore.Timestamp.fromMillis(
              submissionTime.toMillis() +
                campaign.deliveryIntervalDays * 24 * 60 * 60 * 1000
            );
            shouldDeliver = now.toMillis() >= deliveryTime.toMillis();
            
            console.log(`[processScheduledDeliveries] Submission ${submissionId}: submittedAt=${submissionTime.toDate().toISOString()}, deliveryTime=${deliveryTime.toDate().toISOString()}, now=${now.toDate().toISOString()}, shouldDeliver=${shouldDeliver}`);
          }

          if (shouldDeliver) {
            console.log(`[processScheduledDeliveries] Scheduling delivery for submission ${submissionId}, channel: ${campaign.deliveryChannel}, deliveryChoice: ${submission.deliveryChoice}, email: ${submission.formData?.email}`);
            // Deliver based on channel - check both campaign.deliveryChannel and submission.deliveryChoice
            if (campaign.deliveryChannel === "email" || submission.deliveryChoice === "email") {
              deliveryPromises.push(
                sendEmailHelper(submissionId, campaignId).then(() => {
                  console.log(`[processScheduledDeliveries] Email delivered successfully for submission ${submissionId}`);
                }).catch((error) => {
                  console.error(`[processScheduledDeliveries] Failed to deliver email for submission ${submissionId}:`, error);
                })
              );
            } else if (campaign.deliveryChannel === "line" || submission.deliveryChoice === "line") {
              deliveryPromises.push(
                sendLineHelper(submissionId, campaignId).then(() => {
                  console.log(`[processScheduledDeliveries] LINE message delivered successfully for submission ${submissionId}`);
                }).catch((error) => {
                  console.error(`[processScheduledDeliveries] Failed to deliver LINE message for submission ${submissionId}:`, error);
                })
              );
            } else {
              console.warn(`[processScheduledDeliveries] Unknown delivery channel for submission ${submissionId}: ${campaign.deliveryChannel}`);
            }
          }
        }
      }

      console.log(`[processScheduledDeliveries] Waiting for ${deliveryPromises.length} delivery promises to complete`);
      await Promise.all(deliveryPromises);
      console.log(`[processScheduledDeliveries] Completed processing ${deliveryPromises.length} scheduled deliveries`);
      
      // Log campaign and submission counts for debugging
      console.log(`[processScheduledDeliveries] Summary: Checked ${campaignsSnapshot.docs.length} campaigns, processed ${deliveryPromises.length} deliveries`);
    } catch (error) {
      console.error("[processScheduledDeliveries] Error processing scheduled deliveries:", error);
      throw error;
    }
  });

/**
 * Manual trigger function for testing scheduled deliveries
 * Can be called via HTTP to test the delivery process immediately
 */
export const triggerScheduledDeliveries = functions.region('asia-northeast1').https.onRequest(async (req, res) => {
  try {
    console.log('[triggerScheduledDeliveries] Manual trigger called');
    
    // Call the same logic as the scheduled function
    const now = admin.firestore.Timestamp.now();
    console.log(`[triggerScheduledDeliveries] Started at ${now.toDate().toISOString()}`);
    
    // Get all campaigns with pending deliveries
    const campaignsSnapshot = await admin
      .firestore()
      .collection("campaigns")
      .where("deliveryType", "in", ["datetime", "interval"])
      .get();

    console.log(`[triggerScheduledDeliveries] Found ${campaignsSnapshot.docs.length} campaigns with scheduled delivery`);

    const deliveryPromises: Promise<void>[] = [];

    for (const campaignDoc of campaignsSnapshot.docs) {
      const campaign = campaignDoc.data();
      const campaignId = campaignDoc.id;

      console.log(`[triggerScheduledDeliveries] Processing campaign ${campaignId}, deliveryType: ${campaign.deliveryType}, deliveryChannel: ${campaign.deliveryChannel}`);

      // Get all undelivered submissions for this campaign
      const allSubmissionsSnapshot = await admin
        .firestore()
        .collection("submissions")
        .where("campaignId", "==", campaignId)
        .get();
      
      // Filter to only get undelivered submissions
      const undeliveredSubmissions = allSubmissionsSnapshot.docs.filter(doc => {
        const data = doc.data();
        return data.delivered !== true;
      });

      console.log(`[triggerScheduledDeliveries] Campaign ${campaignId}: ${undeliveredSubmissions.length} undelivered submissions out of ${allSubmissionsSnapshot.docs.length} total`);

      // Log all submissions for debugging
      for (const subDoc of allSubmissionsSnapshot.docs) {
        const subData = subDoc.data();
        console.log(`[triggerScheduledDeliveries] Submission ${subDoc.id}: email=${subData.formData?.email}, delivered=${subData.delivered}, deliveryChoice=${subData.deliveryChoice}`);
      }

      for (const submissionDoc of undeliveredSubmissions) {
        const submission = submissionDoc.data();
        const submissionId = submissionDoc.id;

        console.log(`[triggerScheduledDeliveries] Checking submission ${submissionId}: email=${submission.formData?.email}, deliveryChoice=${submission.deliveryChoice}, campaign.deliveryChannel=${campaign.deliveryChannel}`);

        let shouldDeliver = false;
        let deliveryTime: admin.firestore.Timestamp | null = null;

        // First, check if submission has deliveredAt set (scheduled delivery time set when submission was created)
        if (submission.deliveredAt && typeof submission.deliveredAt === 'string') {
          const scheduledDate = new Date(submission.deliveredAt);
          deliveryTime = admin.firestore.Timestamp.fromDate(scheduledDate);
          shouldDeliver = now.toMillis() >= deliveryTime.toMillis();
          console.log(`[triggerScheduledDeliveries] Submission ${submissionId}: Using deliveredAt (scheduled time)=${deliveryTime.toDate().toISOString()}, now=${now.toDate().toISOString()}, shouldDeliver=${shouldDeliver}`);
        } else if (submission.deliveredAt && submission.deliveredAt instanceof admin.firestore.Timestamp) {
          // If deliveredAt is already a Timestamp (from Firestore), use it directly
          deliveryTime = submission.deliveredAt;
          shouldDeliver = now.toMillis() >= deliveryTime.toMillis();
          console.log(`[triggerScheduledDeliveries] Submission ${submissionId}: Using deliveredAt (scheduled time, Timestamp)=${deliveryTime.toDate().toISOString()}, now=${now.toDate().toISOString()}, shouldDeliver=${shouldDeliver}`);
        }
        // Otherwise, calculate delivery time based on campaign type (backward compatibility)
        else if (campaign.deliveryType === "datetime" && campaign.deliveryDateTime) {
          let deliveryDate: Date;
          if (campaign.deliveryDateTime instanceof admin.firestore.Timestamp) {
            deliveryDate = campaign.deliveryDateTime.toDate();
          } else if (typeof campaign.deliveryDateTime === "string") {
            const dateStr = campaign.deliveryDateTime;
            if (dateStr.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)) {
              deliveryDate = new Date(dateStr + "+09:00");
            } else {
              deliveryDate = new Date(dateStr);
            }
          } else {
            deliveryDate = new Date(campaign.deliveryDateTime);
          }
          deliveryTime = admin.firestore.Timestamp.fromDate(deliveryDate);
          shouldDeliver = now.toMillis() >= deliveryTime.toMillis();
          
          console.log(`[triggerScheduledDeliveries] Submission ${submissionId}: deliveryTime=${deliveryTime.toDate().toISOString()}, now=${now.toDate().toISOString()}, shouldDeliver=${shouldDeliver}`);
        } else if (
          campaign.deliveryType === "interval" &&
          campaign.deliveryIntervalDays
        ) {
          let submissionTime: admin.firestore.Timestamp;
          if (submission.submittedAt instanceof admin.firestore.Timestamp) {
            submissionTime = submission.submittedAt;
          } else if (typeof submission.submittedAt === "string") {
            submissionTime = admin.firestore.Timestamp.fromDate(
              new Date(submission.submittedAt)
            );
          } else {
            submissionTime = now;
          }
          
          deliveryTime = admin.firestore.Timestamp.fromMillis(
            submissionTime.toMillis() +
              campaign.deliveryIntervalDays * 24 * 60 * 60 * 1000
          );
          shouldDeliver = now.toMillis() >= deliveryTime.toMillis();
          
          console.log(`[triggerScheduledDeliveries] Submission ${submissionId}: submittedAt=${submissionTime.toDate().toISOString()}, deliveryTime=${deliveryTime.toDate().toISOString()}, now=${now.toDate().toISOString()}, shouldDeliver=${shouldDeliver}`);
        }

        if (shouldDeliver) {
          console.log(`[triggerScheduledDeliveries] Scheduling delivery for submission ${submissionId}, channel: ${campaign.deliveryChannel}, email: ${submission.formData?.email}`);
          if (campaign.deliveryChannel === "email") {
            deliveryPromises.push(
              sendEmailHelper(submissionId, campaignId).then(() => {
                console.log(`[triggerScheduledDeliveries] Email delivered successfully for submission ${submissionId}`);
              }).catch((error) => {
                console.error(`[triggerScheduledDeliveries] Failed to deliver email for submission ${submissionId}:`, error);
              })
            );
          } else if (campaign.deliveryChannel === "line") {
            deliveryPromises.push(
              sendLineHelper(submissionId, campaignId).then(() => {
                console.log(`[triggerScheduledDeliveries] LINE message delivered successfully for submission ${submissionId}`);
              }).catch((error) => {
                console.error(`[triggerScheduledDeliveries] Failed to deliver LINE message for submission ${submissionId}:`, error);
              })
            );
          }
        }
      }
    }

    console.log(`[triggerScheduledDeliveries] Waiting for ${deliveryPromises.length} delivery promises to complete`);
    await Promise.all(deliveryPromises);
    console.log(`[triggerScheduledDeliveries] Completed processing ${deliveryPromises.length} scheduled deliveries`);
    
    res.status(200).json({
      success: true,
      message: `Processed ${deliveryPromises.length} deliveries`,
      checkedCampaigns: campaignsSnapshot.docs.length,
      processedDeliveries: deliveryPromises.length
    });
  } catch (error: any) {
    console.error("[triggerScheduledDeliveries] Error:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

