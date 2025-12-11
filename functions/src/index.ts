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
  if (campaign.deliveryChannel !== "email" && submission.deliveryChoice !== "email") {
    throw new Error("This submission is not configured for email delivery");
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
  console.log(`Attempting to send email:`, {
    from: fromEmail,
    to: recipientEmail,
    subject: emailSubject,
    smtpHost: process.env.SMTP_HOST || "smtp.futuremessage-app.com",
    smtpPort: process.env.SMTP_PORT || "587",
  });
  
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
  await submissionDoc.ref.update({
    delivered: true,
    deliveredAt: admin.firestore.FieldValue.serverTimestamp(),
  });
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
  await submissionDoc.ref.update({
    delivered: true,
    deliveredAt: admin.firestore.FieldValue.serverTimestamp(),
  });
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
  .schedule("every 1 hours")
  .timeZone("Asia/Tokyo")
  .onRun(async (context) => {
    try {
      const now = admin.firestore.Timestamp.now();
      
      // Get all campaigns with pending deliveries
      const campaignsSnapshot = await admin
        .firestore()
        .collection("campaigns")
        .where("deliveryType", "in", ["datetime", "interval"])
        .get();

      const deliveryPromises: Promise<void>[] = [];

      for (const campaignDoc of campaignsSnapshot.docs) {
        const campaign = campaignDoc.data();
        const campaignId = campaignDoc.id;

        // Get all undelivered submissions for this campaign
        const submissionsSnapshot = await admin
          .firestore()
          .collection("submissions")
          .where("campaignId", "==", campaignId)
          .where("delivered", "==", false)
          .get();

        for (const submissionDoc of submissionsSnapshot.docs) {
          const submission = submissionDoc.data();
          const submissionId = submissionDoc.id;

          let shouldDeliver = false;

          // Check delivery time based on delivery type
          if (campaign.deliveryType === "datetime" && campaign.deliveryDateTime) {
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
            const deliveryTime = admin.firestore.Timestamp.fromDate(deliveryDate);
            shouldDeliver = now >= deliveryTime;
            
            // Log for debugging
            if (shouldDeliver) {
              console.log(`Delivery time reached for submission ${submissionId}: ${deliveryTime.toDate().toISOString()}, now: ${now.toDate().toISOString()}`);
            }
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
            
            const deliveryTime = admin.firestore.Timestamp.fromMillis(
              submissionTime.toMillis() +
                campaign.deliveryIntervalDays * 24 * 60 * 60 * 1000
            );
            shouldDeliver = now >= deliveryTime;
          }

          if (shouldDeliver) {
            // Deliver based on channel
            if (campaign.deliveryChannel === "email") {
              deliveryPromises.push(
                sendEmailHelper(submissionId, campaignId).then(() => {
                  console.log(`Email delivered for submission ${submissionId}`);
                }).catch((error) => {
                  console.error(`Failed to deliver email for submission ${submissionId}:`, error);
                })
              );
            } else if (campaign.deliveryChannel === "line") {
              deliveryPromises.push(
                sendLineHelper(submissionId, campaignId).then(() => {
                  console.log(`LINE message delivered for submission ${submissionId}`);
                }).catch((error) => {
                  console.error(`Failed to deliver LINE message for submission ${submissionId}:`, error);
                })
              );
            }
          }
        }
      }

      await Promise.all(deliveryPromises);
      console.log(`Processed ${deliveryPromises.length} scheduled deliveries`);
      
      // Log campaign and submission counts for debugging
      console.log(`Checked ${campaignsSnapshot.docs.length} campaigns, found ${deliveryPromises.length} deliveries to process`);
    } catch (error) {
      console.error("Error processing scheduled deliveries:", error);
      throw error;
    }
  });

