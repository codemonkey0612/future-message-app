import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { addSubmission, getCampaign } from '../../services/firestoreService';
import { Campaign, Submission } from '../../types';
import Spinner from '../../components/common/Spinner';
import SurveyModal from '../client/SurveyModal';
import { functions } from '../../services/firebase';

const LineCallback: React.FC = () => {
  const [status, setStatus] = useState<'processing' | 'awaiting_survey' | 'success' | 'error'>('processing');
  const [errorMessage, setErrorMessage] = useState('');
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [isSurveyOpen, setIsSurveyOpen] = useState(false);
  const [pendingSubmissionData, setPendingSubmissionData] = useState<Omit<Submission, 'id'> | null>(null);

  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const processCallback = async () => {
      const params = new URLSearchParams(location.search);
      const code = params.get('code');
      const state = params.get('state');
      const error = params.get('error');
      const errorDescription = params.get('error_description');

      // Check for LINE authorization errors
      if (error) {
        console.error('LINE authorization error:', error, errorDescription);
        const errorMsg = errorDescription 
          ? `LINE認証エラー: ${errorDescription}` 
          : `LINE認証エラー: ${error}`;
        
        // Try to get campaign ID from sessionStorage before clearing
        let campaignIdForError: string | null = null;
        try {
          const pendingSubmissionJSON = sessionStorage.getItem('pendingSubmission');
          if (pendingSubmissionJSON) {
            campaignIdForError = JSON.parse(pendingSubmissionJSON).campaignId;
          }
        } catch(e) { /* ignore */ }
        
        sessionStorage.removeItem('lineAuthState');
        sessionStorage.removeItem('pendingSubmission');
        
        if (campaignIdForError) {
          try {
            const campaignData = await getCampaign(campaignIdForError);
            setCampaign(campaignData);
          } catch (e) {
            console.error("Could not fetch campaign for error page", e);
          }
        }
        
        setErrorMessage(errorMsg);
        setStatus('error');
        return;
      }

      const storedState = sessionStorage.getItem('lineAuthState');
      const pendingSubmissionJSON = sessionStorage.getItem('pendingSubmission');
      
      console.log('LINE callback params:', { code: !!code, state, storedState: !!storedState, pendingSubmission: !!pendingSubmissionJSON });
      
      let campaignIdForError: string | null = null;
      if (pendingSubmissionJSON) {
        try {
          const pendingData = JSON.parse(pendingSubmissionJSON);
          campaignIdForError = pendingData.campaignId;
        } catch(e) {
          console.error('Error parsing pendingSubmission:', e);
        }
      }
      
      const handleError = async (message: string) => {
        console.error('LINE callback error:', message);
        setErrorMessage(message);
        if (campaignIdForError && !campaign) {
          try {
            const campaignData = await getCampaign(campaignIdForError);
            setCampaign(campaignData);
          } catch (e) {
            console.error("Could not fetch campaign for error page", e);
          }
        }
        setStatus('error');
      };

      // Clear sessionStorage after checking
      sessionStorage.removeItem('lineAuthState');
      sessionStorage.removeItem('pendingSubmission');

      if (!code) {
        await handleError('認証コードが取得できませんでした。もう一度お試しください。');
        return;
      }

      if (!state || !storedState) {
        await handleError('認証状態が確認できませんでした。もう一度お試しください。');
        return;
      }

      if (!pendingSubmissionJSON) {
        await handleError('送信データが見つかりませんでした。最初からやり直してください。');
        return;
      }

      if (state !== storedState) {
        await handleError('認証に失敗しました。セッションの有効期限が切れている可能性があります。');
        return;
      }
      
      try {
        let pendingSubmission: Omit<Submission, 'id' | 'lineUserId'>;
        try {
          pendingSubmission = JSON.parse(pendingSubmissionJSON);
        } catch (parseError) {
          throw new Error('送信データの解析に失敗しました。');
        }

        if (!pendingSubmission.campaignId) {
          throw new Error('キャンペーンIDが見つかりませんでした。');
        }

        const fetchedCampaign = await getCampaign(pendingSubmission.campaignId);
        if (!fetchedCampaign) {
          throw new Error('キャンペーンが見つかりませんでした。');
        }

        if (!fetchedCampaign.lineChannelId || !fetchedCampaign.lineChannelSecret) {
          throw new Error('LINEチャンネル設定が不完全です。管理画面でLINEチャンネルIDとシークレットを設定してください。');
        }
        setCampaign(fetchedCampaign);

        // Use Firebase Function to securely exchange LINE token
        // Using direct HTTP call since we're using onRequest instead of onCall
        // This avoids region/CORS issues with Firebase v8
        const redirectUri = `${window.location.origin}/line/callback`;
        console.log('Calling exchangeLineToken with:', { 
          code: !!code, 
          redirectUri,
          campaignId: fetchedCampaign.id,
          origin: window.location.origin 
        });
        
        // Call the function directly via HTTP
        // The function is deployed to asia-northeast1 region
        // Project ID is 'futuremessage-app' based on Firebase config
        const projectId = 'futuremessage-app';
        const functionUrl = `https://asia-northeast1-${projectId}.cloudfunctions.net/exchangeLineToken`;
        
        let response;
        try {
          console.log('Calling function URL:', functionUrl);
          response = await fetch(functionUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              code,
              redirectUri,
              campaignId: fetchedCampaign.id,
            }),
          });
        } catch (fetchError: any) {
          console.error('Fetch error:', fetchError);
          throw new Error(`ネットワークエラー: ${fetchError.message}`);
        }
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
          console.error('Function error response:', errorData);
          let errorMsg = 'LINE認証の処理に失敗しました。';
          if (errorData.error === 'not-found') {
            errorMsg = 'キャンペーンが見つかりませんでした。';
          } else if (errorData.error === 'failed-precondition') {
            errorMsg = errorData.message || 'LINEチャンネル設定が不完全です。';
          } else if (errorData.message) {
            errorMsg = errorData.message;
          }
          throw new Error(errorMsg);
        }
        
        const result = await response.json();
        
        if (!result || !result.lineUserId) {
          throw new Error('LINEユーザーIDの取得に失敗しました。');
        }

        const { lineUserId, success } = result as { lineUserId: string; success?: boolean };

        if (!lineUserId) {
          throw new Error('LINEユーザーIDの取得に失敗しました。LINE認証を再度お試しください。');
        }

        // Calculate delivery time before creating submission
        let scheduledDeliveryTime: string;
        const submittedAt = new Date(pendingSubmission.submittedAt || new Date().toISOString());
        
        // Helper to format date in Asia/Tokyo timezone as ISO string
        const toTokyoISOString = (date: Date): string => {
          const tokyoOffset = 9 * 60; // minutes
          const utc = date.getTime() + (date.getTimezoneOffset() * 60000);
          const tokyoTime = new Date(utc + (tokyoOffset * 60000));
          return tokyoTime.toISOString();
        };
        
        if (fetchedCampaign.deliveryType === 'datetime' && fetchedCampaign.deliveryDateTime) {
          const deliveryDate = new Date(fetchedCampaign.deliveryDateTime);
          scheduledDeliveryTime = toTokyoISOString(deliveryDate);
        } else if (fetchedCampaign.deliveryType === 'interval' && fetchedCampaign.deliveryIntervalDays) {
          const deliveryDate = new Date(submittedAt);
          deliveryDate.setDate(deliveryDate.getDate() + Number(fetchedCampaign.deliveryIntervalDays));
          scheduledDeliveryTime = toTokyoISOString(deliveryDate);
        } else {
          const deliveryDate = new Date(submittedAt);
          deliveryDate.setDate(deliveryDate.getDate() + 1);
          scheduledDeliveryTime = toTokyoISOString(deliveryDate);
        }
        
        const submittedAtISO = toTokyoISOString(submittedAt);

        const submissionWithUser: Omit<Submission, 'id'> = {
          ...pendingSubmission,
          lineUserId,
          submittedAt: submittedAtISO,
          delivered: false, // Initialize as not delivered
          deliveredAt: scheduledDeliveryTime, // Set the scheduled delivery time
        };

        if (fetchedCampaign.settings.survey.enabled && fetchedCampaign.settings.survey.questions.length > 0) {
            setPendingSubmissionData(submissionWithUser);
            setStatus('awaiting_survey');
            setIsSurveyOpen(true);
        } else {
            console.log('Adding submission without survey:', submissionWithUser);
            await addSubmission(submissionWithUser);
            // Mark as submitted
            localStorage.setItem(`fma_submitted_${fetchedCampaign.id}`, 'true');
            setStatus('success');
        }

      } catch (error: any) {
        console.error('LINE callback error:', error);
        const errorMessage = error.message || '処理中にエラーが発生しました。';
        await handleError(errorMessage);
      }
    };

    processCallback();
  }, [location, navigate]);
  
  const handleSurveySubmit = async (surveyAnswers: any) => {
    setIsSurveyOpen(false);
    setStatus('processing');

    if (!pendingSubmissionData) {
        setErrorMessage('送信データが見つかりませんでした。');
        setStatus('error');
        return;
    }
    
    try {
        // Calculate delivery time based on campaign type
        let scheduledDeliveryTime: string;
        const submittedAtDate = new Date(pendingSubmissionData.submittedAt || new Date().toISOString());
        
        if (campaign?.deliveryType === 'datetime' && campaign.deliveryDateTime) {
            // Use the campaign's deliveryDateTime
            // If format is "YYYY-MM-DDTHH:mm" without timezone, assume Asia/Tokyo (UTC+9)
            let deliveryDate: Date;
            const dateStr = campaign.deliveryDateTime;
            if (typeof dateStr === 'string' && dateStr.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)) {
                // Format: "2025-12-11T14:00" - assume Asia/Tokyo timezone
                deliveryDate = new Date(dateStr + "+09:00");
            } else {
                deliveryDate = new Date(campaign.deliveryDateTime);
            }
            scheduledDeliveryTime = deliveryDate.toISOString();
        } else if (campaign?.deliveryType === 'interval' && campaign.deliveryIntervalDays) {
            // Calculate: submittedAt + interval days
            const deliveryDate = new Date(submittedAtDate);
            deliveryDate.setDate(deliveryDate.getDate() + Number(campaign.deliveryIntervalDays));
            scheduledDeliveryTime = deliveryDate.toISOString();
        } else {
            // Default: schedule for 1 day from now if no delivery type is set
            const deliveryDate = new Date(submittedAtDate);
            deliveryDate.setDate(deliveryDate.getDate() + 1);
            scheduledDeliveryTime = deliveryDate.toISOString();
        }
        
        const submittedAtISO = submittedAtDate.toISOString();
        
        console.log('[LineCallback] Creating submission:');
        console.log('[LineCallback] - submittedAt:', submittedAtISO);
        console.log('[LineCallback] - deliveredAt:', scheduledDeliveryTime);
        
        const finalSubmission: Omit<Submission, 'id'> = { 
          ...pendingSubmissionData, 
          submittedAt: submittedAtISO,
          surveyAnswers,
          delivered: false, // Initialize as not delivered
          deliveredAt: scheduledDeliveryTime, // Set the scheduled delivery time - ALWAYS set this field
        };
        
        console.log('[LineCallback] Full submission object:', JSON.stringify(finalSubmission, null, 2));
        
        console.log('[LineCallback] Submission data before sending:', JSON.stringify(finalSubmission, null, 2));
        await addSubmission(finalSubmission);
        console.log('[LineCallback] Submission created successfully');
        if (campaign) {
          localStorage.setItem(`fma_submitted_${campaign.id}`, 'true');
        }
        setStatus('success');
    } catch (error: any) {
        console.error('Final submission error:', error);
        setErrorMessage(error.message || 'アンケートの保存中にエラーが発生しました。');
        setStatus('error');
    }
  };

  const getDeliveryDateText = () => {
      if (!campaign) return '';
      if (campaign.deliveryType === 'datetime' && campaign.deliveryDateTime) {
          return `メッセージは ${new Date(campaign.deliveryDateTime).toLocaleString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })} に配信予定です。`;
      }
      if (campaign.deliveryType === 'interval' && campaign.deliveryIntervalDays) {
          const deliveryDate = new Date();
          // Ensure number conversion
          deliveryDate.setDate(deliveryDate.getDate() + Number(campaign.deliveryIntervalDays));
          return `メッセージは ${deliveryDate.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })} 頃に配信予定です。`;
      }
      return 'メッセージは後日配信されます。';
  };

  if (isSurveyOpen && campaign?.settings.survey) {
    return (
        <SurveyModal 
            survey={campaign.settings.survey}
            onClose={() => {
                setIsSurveyOpen(false);
                setErrorMessage('アンケートがキャンセルされました。');
                setStatus('error');
            }}
            onSubmit={handleSurveySubmit}
        />
    )
  }

  const renderContent = () => {
    switch (status) {
      case 'processing':
        return (
          <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
            <Spinner />
            <p className="mt-4 text-gray-600">LINE認証を処理しています...</p>
          </div>
        );
      case 'awaiting_survey':
        return (
          <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
            <Spinner />
            <p className="mt-4 text-gray-600">アンケートを読み込み中...</p>
          </div>
        );
      case 'success':
        return (
          <div className="flex items-center justify-center min-h-screen bg-gray-100 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-8 text-center">
              <svg className="mx-auto h-16 w-16 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <h2 className="text-2xl font-bold text-gray-800 mt-4">ありがとうございます！</h2>
              <p className="text-gray-600 mt-2">
                未来へのメッセージが正常に送信されました。
              </p>
              <p className="text-gray-700 mt-4 text-sm bg-gray-100 p-3 rounded-md">
                {getDeliveryDateText()}
              </p>
            </div>
          </div>
        );
      case 'error':
        return (
          <div className="flex items-center justify-center min-h-screen bg-gray-100 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-8 text-center">
               <svg className="mx-auto h-16 w-16 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
               </svg>
              <h2 className="text-2xl font-bold text-gray-800 mt-4">エラーが発生しました</h2>
              <p className="text-red-600 mt-2 bg-red-50 p-3 rounded-md">{errorMessage}</p>
              <button
                onClick={() => navigate(`/campaign/${campaign?.id || ''}`)}
                className="mt-6 px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-hover"
                disabled={!campaign?.id}
              >
                キャンペーンページに戻る
              </button>
            </div>
          </div>
        );
    }
  };

  return <>{renderContent()}</>;
};

export default LineCallback;