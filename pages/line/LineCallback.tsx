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

      const storedState = sessionStorage.getItem('lineAuthState');
      const pendingSubmissionJSON = sessionStorage.getItem('pendingSubmission');
      
      let campaignIdForError: string | null = null;
      if (pendingSubmissionJSON) {
        try {
          campaignIdForError = JSON.parse(pendingSubmissionJSON).campaignId;
        } catch(e) { /* ignore */ }
      }

      sessionStorage.removeItem('lineAuthState');
      sessionStorage.removeItem('pendingSubmission');
      
      const handleError = async (message: string) => {
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

      if (!code || !state || !storedState || !pendingSubmissionJSON) {
        await handleError('無効なリクエストです。もう一度お試しください。');
        return;
      }

      if (state !== storedState) {
        await handleError('認証に失敗しました。セッションの有効期限が切れている可能性があります。');
        return;
      }
      
      try {
        const pendingSubmission: Omit<Submission, 'id' | 'lineUserId'> = JSON.parse(pendingSubmissionJSON);
        const fetchedCampaign = await getCampaign(pendingSubmission.campaignId);
        if (!fetchedCampaign || !fetchedCampaign.lineChannelId || !fetchedCampaign.lineChannelSecret) {
          throw new Error('キャンペーン設定が不完全です。');
        }
        setCampaign(fetchedCampaign);

        // Use Firebase Function to securely exchange LINE token
        // This keeps the Channel Secret on the server
        const exchangeLineToken = functions.httpsCallable('exchangeLineToken');
        
        const redirectUri = `${window.location.origin}/line/callback`;
        const result = await exchangeLineToken({
          code,
          redirectUri,
          campaignId: fetchedCampaign.id,
        });
        
        const { lineUserId } = result.data as { lineUserId: string; success: boolean };

        if (!lineUserId) {
            throw new Error('LINEユーザーIDの取得に失敗しました。')
        }

        const submissionWithUser: Omit<Submission, 'id'> = {
          ...pendingSubmission,
          lineUserId,
          delivered: false, // Initialize as not delivered
        };

        if (fetchedCampaign.settings.survey.enabled && fetchedCampaign.settings.survey.questions.length > 0) {
            setPendingSubmissionData(submissionWithUser);
            setStatus('awaiting_survey');
            setIsSurveyOpen(true);
        } else {
            await addSubmission(submissionWithUser);
            // Mark as submitted
            localStorage.setItem(`fma_submitted_${fetchedCampaign.id}`, 'true');
            setStatus('success');
        }

      } catch (error: any) {
        console.error('LINE callback error:', error);
        await handleError(error.message || '処理中にエラーが発生しました。');
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
        const finalSubmission: Omit<Submission, 'id'> = { 
          ...pendingSubmissionData, 
          surveyAnswers,
          delivered: false, // Initialize as not delivered
        };
        await addSubmission(finalSubmission);
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