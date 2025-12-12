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
export const exchangeLineToken = functions.region('asia-northeast1').https.onCall(async (data, context) => {
  // Verify the request is authenticated (optional - remove if you want public access)
  // if (!context.auth) {
  //   throw new functions.https.HttpsError(
  //     "unauthenticated",
  //     "The function must be called while authenticated."
  //   );
  // }

  const { code, redirectUri, campaignId } = data as { code?: string; redirectUri?: string; campaignId?: string };

  // Validate input
  if (!code || !redirectUri || !campaignId) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Missing required parameters: code, redirectUri, or campaignId"
    );
  }

  try {
    // Get campaign from Firestore to retrieve LINE credentials
    const campaignDoc = await admin.firestore().collection("campaigns").doc(campaignId).get();
    
    if (!campaignDoc.exists) {
      throw new functions.https.HttpsError(
        "not-found",
        "Campaign not found"
      );
    }

    const campaign = campaignDoc.data();
    
    if (!campaign?.lineChannelId || !campaign?.lineChannelSecret) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Campaign LINE configuration is incomplete"
      );
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
      throw new functions.https.HttpsError(
        "internal",
        tokenData.error_description || "Failed to exchange LINE token"
      );
    }

    // Decode ID token to get user ID
    const idTokenPayload = JSON.parse(
      Buffer.from(tokenData.id_token.split(".")[1], "base64").toString()
    );
    const lineUserId = idTokenPayload.sub;

    if (!lineUserId) {
      throw new functions.https.HttpsError(
        "internal",
        "Failed to extract LINE user ID from token"
      );
    }

    // Return the LINE user ID (don't return the full token for security)
    return {
      lineUserId,
      success: true,
    };
  } catch (error: any) {
    console.error("LINE token exchange error:", error);
    
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    
    throw new functions.https.HttpsError(
      "internal",
      error.message || "An error occurred during LINE token exchange"
    );
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
  
  emailBody = emailBody
    .replace(/\{message\}/g, submission.formData?.message || "")
    .replace(/\{email\}/g, submission.formData?.email || "")
    .replace(/\{submittedAt\}/g, submittedAtDate.toLocaleString("ja-JP"));

  // Validate recipient email
  const recipientEmail = submission.formData?.email;
  if (!recipientEmail || typeof recipientEmail !== "string" || !recipientEmail.includes("@")) {
    throw new Error("Invalid or missing recipient email address");
  }

  // Send email
  const fromEmail = campaign.settings?.form?.fromEmail || 
                   process.env.EMAIL_USER || 
                   "mail@futuremessage-app.com";
  
  // Prepare HTML body with image if available
  let htmlBody = emailBody.replace(/\n/g, "<br>");
  if (submission.formData?.imageUrl) {
    // Embed image in HTML instead of attachment (since imageUrl is a URL, not a local path)
    htmlBody += `<br><br><img src="${submission.formData.imageUrl}" alt="Message image" style="max-width: 100%; height: auto;">`;
  }
  
  const mailOptions = {
    from: `"${campaign.name || 'Future Message App'}" <${fromEmail}>`,
    to: recipientEmail,
    subject: emailSubject,
    html: htmlBody,
    // Add headers to improve deliverability
    headers: {
      'X-Priority': '1',
      'X-MSMail-Priority': 'High',
      'Importance': 'high',
    },
    // Add text version for better deliverability
    text: emailBody.replace(/<br>/g, '\n').replace(/<[^>]*>/g, ''),
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

  if (!submission.lineUserId) {
    throw new Error("LINE user ID not found in submission");
  }

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

  // Prepare message content
  const lineMessage = campaign.lineMessage || submission.formData?.message || "未来へのメッセージ";

  // Send LINE message using Push Message API
  const messageResponse = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${tokenData.access_token}`,
    },
    body: JSON.stringify({
      to: submission.lineUserId,
      messages: [
        {
          type: "text",
          text: lineMessage,
        },
        // Optional: include image if available
        ...(submission.formData?.imageUrl
          ? [
              {
                type: "image",
                originalContentUrl: submission.formData.imageUrl,
                previewImageUrl: submission.formData.imageUrl,
              },
            ]
          : []),
      ],
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

