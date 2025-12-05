import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const nodemailer = require("nodemailer");

admin.initializeApp();

// Initialize email transporter (configure based on your email provider)
// For production, use environment variables for credentials
// Set these using: firebase functions:config:set email.user="your-email" email.password="your-password"
const emailTransporter = nodemailer.createTransport({
  service: "gmail", // Change to your email provider (gmail, outlook, etc.)
  auth: {
    user: functions.config().email?.user || process.env.EMAIL_USER || "",
    pass: functions.config().email?.password || process.env.EMAIL_PASSWORD || "",
  },
});

/**
 * Exchange LINE OAuth authorization code for access token
 * This keeps the LINE Channel Secret secure on the server
 */
export const exchangeLineToken = functions.https.onCall(async (data, context) => {
  // Verify the request is authenticated (optional - remove if you want public access)
  // if (!context.auth) {
  //   throw new functions.https.HttpsError(
  //     "unauthenticated",
  //     "The function must be called while authenticated."
  //   );
  // }

  const { code, redirectUri, campaignId } = data;

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
 * Send email message to user
 * Triggered by scheduled function or manually
 */
export const sendEmailMessage = functions.https.onCall(async (data, context) => {
  const { submissionId, campaignId } = data;

  if (!submissionId || !campaignId) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Missing required parameters: submissionId or campaignId"
    );
  }

  try {
    // Get submission and campaign from Firestore
    const [submissionDoc, campaignDoc] = await Promise.all([
      admin.firestore().collection("submissions").doc(submissionId).get(),
      admin.firestore().collection("campaigns").doc(campaignId).get(),
    ]);

    if (!submissionDoc.exists || !campaignDoc.exists) {
      throw new functions.https.HttpsError("not-found", "Submission or campaign not found");
    }

    const submission = submissionDoc.data();
    const campaign = campaignDoc.data();

    if (!submission || !campaign) {
      throw new functions.https.HttpsError("not-found", "Data not found");
    }

    // Check if delivery channel is email
    if (campaign.deliveryChannel !== "email" && submission.deliveryChoice !== "email") {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "This submission is not configured for email delivery"
      );
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
    emailBody = emailBody
      .replace(/\{message\}/g, submission.formData?.message || "")
      .replace(/\{email\}/g, submission.formData?.email || "")
      .replace(/\{submittedAt\}/g, new Date(submission.submittedAt).toLocaleString("ja-JP"));

    // Send email
    const mailOptions = {
      from: campaign.settings?.form?.fromEmail || functions.config().email?.user,
      to: submission.formData?.email,
      subject: emailSubject,
      html: emailBody.replace(/\n/g, "<br>"),
      // Optional: attach image if available
      attachments: submission.formData?.imageUrl
        ? [
            {
              filename: "message-image.jpg",
              path: submission.formData.imageUrl,
            },
          ]
        : [],
    };

    await emailTransporter.sendMail(mailOptions);

    // Mark submission as delivered
    await submissionDoc.ref.update({
      delivered: true,
      deliveredAt: admin.firestore.FieldValue.serverTimestamp(),
    });

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
 * Send LINE message to user
 * Triggered by scheduled function or manually
 */
export const sendLineMessage = functions.https.onCall(async (data, context) => {
  const { submissionId, campaignId } = data;

  if (!submissionId || !campaignId) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Missing required parameters: submissionId or campaignId"
    );
  }

  try {
    // Get submission and campaign from Firestore
    const [submissionDoc, campaignDoc] = await Promise.all([
      admin.firestore().collection("submissions").doc(submissionId).get(),
      admin.firestore().collection("campaigns").doc(campaignId).get(),
    ]);

    if (!submissionDoc.exists || !campaignDoc.exists) {
      throw new functions.https.HttpsError("not-found", "Submission or campaign not found");
    }

    const submission = submissionDoc.data();
    const campaign = campaignDoc.data();

    if (!submission || !campaign) {
      throw new functions.https.HttpsError("not-found", "Data not found");
    }

    // Check if delivery channel is LINE
    if (campaign.deliveryChannel !== "line" && submission.deliveryChoice !== "line") {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "This submission is not configured for LINE delivery"
      );
    }

    if (!submission.lineUserId) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "LINE user ID not found in submission"
      );
    }

    if (!campaign.lineChannelId || !campaign.lineChannelSecret) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Campaign LINE configuration is incomplete"
      );
    }

    // Get LINE access token (you may need to store this or refresh it)
    // For now, we'll get a channel access token
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
      throw new functions.https.HttpsError(
        "internal",
        "Failed to get LINE access token"
      );
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
      throw new functions.https.HttpsError(
        "internal",
        errorData.message || "Failed to send LINE message"
      );
    }

    // Mark submission as delivered
    await submissionDoc.ref.update({
      delivered: true,
      deliveredAt: admin.firestore.FieldValue.serverTimestamp(),
    });

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
export const processScheduledDeliveries = functions.pubsub
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
            const deliveryTime = admin.firestore.Timestamp.fromDate(
              new Date(campaign.deliveryDateTime)
            );
            shouldDeliver = now >= deliveryTime;
          } else if (
            campaign.deliveryType === "interval" &&
            campaign.deliveryIntervalDays
          ) {
            const submissionTime = admin.firestore.Timestamp.fromDate(
              new Date(submission.submittedAt)
            );
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
                sendEmailMessage({ submissionId, campaignId }, {} as any).then(() => {
                  console.log(`Email delivered for submission ${submissionId}`);
                })
              );
            } else if (campaign.deliveryChannel === "line") {
              deliveryPromises.push(
                sendLineMessage({ submissionId, campaignId }, {} as any).then(() => {
                  console.log(`LINE message delivered for submission ${submissionId}`);
                })
              );
            }
          }
        }
      }

      await Promise.all(deliveryPromises);
      console.log(`Processed ${deliveryPromises.length} scheduled deliveries`);
    } catch (error) {
      console.error("Error processing scheduled deliveries:", error);
      throw error;
    }
  });

