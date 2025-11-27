import React, { useState, useEffect } from 'react';
import { Campaign, Submission } from '../../types';
import { addSubmission } from '../../services/firestoreService';
import SurveyModal from './SurveyModal';
import Spinner from '../../components/common/Spinner';
import ArrowUpTrayIcon from '../../components/icons/ArrowUpTrayIcon';

interface MessageFormProps {
  campaign: Campaign;
}

const MessageForm: React.FC<MessageFormProps> = ({ campaign }) => {
  const [formData, setFormData] = useState<any>({});
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isSurveyOpen, setIsSurveyOpen] = useState(false);
  const [formErrors, setFormErrors] = useState<any>({});
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionSuccess, setSubmissionSuccess] = useState(false); // Only for email
  const [modalContent, setModalContent] = useState<{ title: string; content: string } | null>(null);
  const [uploadText, setUploadText] = useState('クリックしてアップロード');

  const { form: formSettings, survey: surveySettings, content } = campaign.settings;

  useEffect(() => {
    const isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (isMobile) {
        setUploadText('タップしてアップロード');
    }
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };
  
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
        setFormData({ ...formData, imageUrl: reader.result as string });
      };
      reader.readAsDataURL(file);
    }
  };

  const validateForm = () => {
    const errors: any = {};
    if (formSettings.fields.message.enabled && formSettings.fields.message.required && !formData.message) {
      errors.message = 'メッセージは必須です。';
    }
    if (campaign.deliveryChannel === 'email' && formSettings.fields.email.enabled && formSettings.fields.email.required && !formData.email) {
      errors.email = 'メールアドレスは必須です。';
    } else if (campaign.deliveryChannel === 'email' && formSettings.fields.email.enabled && formData.email && !/\S+@\S+\.\S+/.test(formData.email)) {
        errors.email = 'メールアドレスの形式が正しくありません。'
    }
    
    formSettings.fields.customFields.forEach(field => {
        if(field.enabled && field.required && !formData[field.id]) {
            errors[field.id] = `${field.label}は必須です。`
        }
    });

    if (!agreedToTerms) {
        errors.terms = '利用規約とプライバシーポリシーに同意する必要があります。';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    if (campaign.deliveryChannel === 'line') {
      initiateLineAuth();
    } else {
      if (surveySettings.enabled && surveySettings.questions.length > 0) {
        setIsSurveyOpen(true);
      } else {
        finalizeEmailSubmission({});
      }
    }
  };

  const initiateLineAuth = () => {
    if (!campaign.lineChannelId) {
      alert("LINEチャンネルIDが設定されていません。");
      return;
    }
    setIsSubmitting(true);
    const submissionData = {
        campaignId: campaign.id,
        submittedAt: new Date().toISOString(),
        deliveryChoice: 'line' as const,
        formData,
        surveyAnswers: {}, // Will be filled in after auth
    };

    const state = Math.random().toString(36).substring(2, 15);
    sessionStorage.setItem('pendingSubmission', JSON.stringify(submissionData));
    sessionStorage.setItem('lineAuthState', state);

    const redirectUri = `${window.location.origin}/#/line/callback`;
    const lineAuthUrl = `https://access.line.me/oauth2/v2.1/authorize?response_type=code&client_id=${campaign.lineChannelId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}&scope=profile%20openid`;
    
    window.location.href = lineAuthUrl;
  };
  
  const finalizeEmailSubmission = async (surveyAnswers: any) => {
    setIsSubmitting(true);
    try {
        const newSubmission: Omit<Submission, 'id'> = {
        campaignId: campaign.id,
        submittedAt: new Date().toISOString(),
        deliveryChoice: 'email',
        formData,
        surveyAnswers,
        };
        await addSubmission(newSubmission);
        setSubmissionSuccess(true);
    } catch (error) {
        console.error("Error submitting message:", error);
        alert('メッセージの送信中にエラーが発生しました。');
    } finally {
        setIsSubmitting(false);
    }
  };
  
  const getDeliveryDateText = () => {
      if (!campaign) return '';
      if (campaign.deliveryType === 'datetime' && campaign.deliveryDateTime) {
          return `メッセージは ${new Date(campaign.deliveryDateTime).toLocaleString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })} に配信予定です。`;
      }
      if (campaign.deliveryType === 'interval' && campaign.deliveryIntervalDays) {
          const deliveryDate = new Date();
          deliveryDate.setDate(deliveryDate.getDate() + campaign.deliveryIntervalDays);
          return `メッセージは ${deliveryDate.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })} 頃に配信予定です。`;
      }
      return 'メッセージは後日配信されます。';
  };

  return (
    <>
      <style>{`
        .animate-fade-in-scale {
            animation: fadeInScale 0.3s ease-out forwards;
        }
        @keyframes fadeInScale {
            from { opacity: 0; transform: scale(0.95) translateY(10px); }
            to { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
      <form onSubmit={handleSubmit} className="space-y-6">
        <h2 className="text-2xl font-bold text-center text-gray-800 mb-6">メッセージを作成</h2>

        {formSettings.fields.message.enabled && (
          <div>
            <label htmlFor="message" className="block text-sm font-medium text-gray-700">{formSettings.fields.message.label}</label>
            <textarea
              id="message"
              name="message"
              rows={6}
              onChange={handleInputChange}
              className="mt-1 block w-full p-3 rounded-md border border-gray-300 shadow-sm focus:border-primary focus:ring-2 focus:ring-primary/50"
              required={formSettings.fields.message.required}
            />
            {formErrors.message && <p className="text-red-500 text-sm mt-1">{formErrors.message}</p>}
          </div>
        )}

        {formSettings.fields.image.enabled && (
          <div>
            <label className="block text-sm font-medium text-gray-700">{formSettings.fields.image.label}</label>
             <div 
                className="mt-2 flex justify-center items-center rounded-lg border border-dashed border-gray-900/25 px-6 py-10 text-center relative cursor-pointer hover:border-primary transition-colors"
                onClick={() => document.getElementById('image')?.click()}
            >
                <input type="file" id="image" name="image" accept="image/*" onChange={handleImageChange} className="sr-only" />
                {imagePreview ? (
                    <img src={imagePreview} alt="Preview" className="max-h-48 rounded-lg object-contain mx-auto" />
                ) : (
                    <div>
                        <ArrowUpTrayIcon className="mx-auto h-12 w-12 text-gray-300" />
                        <p className="mt-2 text-sm text-gray-600">
                            <span className="font-semibold" style={{ color: campaign.settings.design.themeColor }}>{uploadText}</span>
                        </p>
                        <p className="text-xs text-gray-500">またはファイルをドラッグ</p>
                    </div>
                )}
            </div>
          </div>
        )}

        <div>
            <label className="block text-sm font-medium text-gray-700">配信方法</label>
            <div className="mt-1 text-gray-800 p-3 bg-gray-100 rounded-md">
                {campaign.deliveryChannel === 'email' ? 'メール' : 'LINE'}
            </div>
        </div>
        
        {campaign.deliveryChannel === 'line' && (
            <div className="p-3 text-sm text-sky-800 bg-sky-100 border-l-4 border-sky-500 rounded-r-md">
                <p className="font-semibold">LINEでメッセージを受け取るには</p>
                <p className="mt-1">送信後、LINE認証と指定アカウントの友だち追加が必要です。</p>
            </div>
        )}
        
        {campaign.deliveryChannel === 'email' && (
          <div className="p-3 text-sm text-sky-800 bg-sky-100 border-l-4 border-sky-500 rounded-r-md">
            <p className="font-semibold">メールでメッセージを受け取るには</p>
            <p className="mt-1">迷惑メールフォルダに振り分けられることがあります。{campaign.settings.form.fromEmail && `「${campaign.settings.form.fromEmail}」`}からのメールを受信できるよう設定してください。</p>
          </div>
        )}

        {campaign.deliveryChannel === 'email' && formSettings.fields.email.enabled && (
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700">{formSettings.fields.email.label}</label>
            <input
              type="email"
              id="email"
              name="email"
              onChange={handleInputChange}
              className="mt-1 block w-full p-3 rounded-md border border-gray-300 shadow-sm focus:border-primary focus:ring-2 focus:ring-primary/50"
              required={formSettings.fields.email.required}
              placeholder="example@email.com"
            />
             {formErrors.email && <p className="text-red-500 text-sm mt-1">{formErrors.email}</p>}
          </div>
        )}

        {formSettings.fields.customFields.map(field => field.enabled && (
            <div key={field.id}>
                 <label htmlFor={field.id} className="block text-sm font-medium text-gray-700">{field.label}</label>
                 <input type="text" id={field.id} name={field.id} onChange={handleInputChange} className="mt-1 block w-full p-3 rounded-md border border-gray-300 shadow-sm focus:border-primary focus:ring-2 focus:ring-primary/50" required={field.required}/>
                 {formErrors[field.id] && <p className="text-red-500 text-sm mt-1">{formErrors[field.id]}</p>}
            </div>
        ))}

        <div className="flex items-start">
            <div className="flex items-center h-5">
                <input id="terms" name="terms" type="checkbox" checked={agreedToTerms} onChange={(e) => setAgreedToTerms(e.target.checked)} className="focus:ring-primary h-4 w-4 text-primary border-gray-300 rounded"/>
            </div>
            <div className="ml-3 text-sm">
                <label htmlFor="terms" className="font-medium text-gray-700">
                  <button type="button" onClick={() => setModalContent({ title: '利用規約', content: content.terms })} className="text-primary hover:underline">利用規約</button>と
                  <button type="button" onClick={() => setModalContent({ title: 'プライバシーポリシー', content: content.privacy })} className="text-primary hover:underline">プライバシーポリシー</button>に同意します。
                </label>
                {formErrors.terms && <p className="text-red-500 text-sm mt-1">{formErrors.terms}</p>}
            </div>
        </div>

        <button type="submit" style={{ backgroundColor: campaign.settings.design.themeColor }} className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-base font-medium text-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:bg-gray-400" disabled={isSubmitting}>
          {isSubmitting ? <Spinner /> : (campaign.deliveryChannel === 'line' ? 'LINE認証をして送信' : 'メッセージを送信')}
        </button>
      </form>

      {isSurveyOpen && (
        <SurveyModal
          survey={surveySettings}
          onClose={() => setIsSurveyOpen(false)}
          onSubmit={finalizeEmailSubmission}
        />
      )}
      {modalContent && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-75 flex items-center justify-center z-50 p-4 transition-opacity duration-300" aria-modal="true" role="dialog">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col transform transition-all duration-300 animate-fade-in-scale">
            <div className="p-4 border-b flex justify-between items-center sticky top-0 bg-white z-10">
                <h3 className="text-lg font-bold text-gray-800">{modalContent.title}</h3>
                <button onClick={() => setModalContent(null)} className="text-gray-500 hover:text-gray-800 text-2xl leading-none">&times;</button>
            </div>
            <div className="p-6 overflow-y-auto">
                <p className="whitespace-pre-wrap text-gray-600">{modalContent.content}</p>
            </div>
            <div className="p-4 border-t text-right sticky bottom-0 bg-gray-50">
                <button onClick={() => setModalContent(null)} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300">閉じる</button>
            </div>
          </div>
        </div>
      )}
      {submissionSuccess && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-75 flex items-center justify-center z-50 p-4 transition-opacity duration-300" aria-modal="true" role="dialog">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-8 text-center animate-fade-in-scale">
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
      )}
    </>
  );
};

export default MessageForm;