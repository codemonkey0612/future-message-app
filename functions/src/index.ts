import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

admin.initializeApp();

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

