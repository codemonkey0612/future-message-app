import React, { useState } from 'react';
import { Campaign, Submission } from '../../types';
import { addSubmission } from '../../services/firestoreService';
import SurveyModal from './SurveyModal';
import Spinner from '../../components/common/Spinner';

interface MessageFormProps {
  campaign: Campaign;
}

const MessageForm: React.FC<MessageFormProps> = ({ campaign }) => {
  const [formData, setFormData] = useState<any>({});
  const [deliveryChoice, setDeliveryChoice] = useState<'email' | 'line'>('email');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isSurveyOpen, setIsSurveyOpen] = useState(false);
  const [formErrors, setFormErrors] = useState<any>({});
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionSuccess, setSubmissionSuccess] = useState(false);

  const { form: formSettings, survey: surveySettings } = campaign.settings;

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
    if (formSettings.fields.message.required && !formData.message) {
      errors.message = 'メッセージは必須です。';
    }
    if (formSettings.fields.email.required && !formData.email) {
      errors.email = 'メールアドレスは必須です。';
    } else if (formSettings.fields.email.enabled && formData.email && !/\S+@\S+\.\S+/.test(formData.email)) {
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

    if (surveySettings.enabled && surveySettings.questions.length > 0) {
      setIsSurveyOpen(true);
    } else {
      finalizeSubmission({});
    }
  };
  
  const finalizeSubmission = async (surveyAnswers: any) => {
    setIsSubmitting(true);
    try {
        const newSubmission: Omit<Submission, 'id'> = {
        campaignId: campaign.id,
        submittedAt: new Date().toISOString(),
        deliveryChoice,
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
  
  if (submissionSuccess) {
      return (
          <div className="text-center p-8 border-2 border-dashed border-green-400 rounded-lg bg-green-50">
              <h2 className="text-2xl font-bold text-green-700">ありがとうございます！</h2>
              <p className="text-green-600 mt-2">
                  未来へのメッセージが正常に送信されました。
              </p>
          </div>
      )
  }

  return (
    <>
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
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring-primary"
              required={formSettings.fields.message.required}
            />
            {formErrors.message && <p className="text-red-500 text-sm mt-1">{formErrors.message}</p>}
          </div>
        )}

        {formSettings.fields.image.enabled && (
          <div>
            <label htmlFor="image" className="block text-sm font-medium text-gray-700">{formSettings.fields.image.label}</label>
            <input type="file" id="image" name="image" accept="image/*" onChange={handleImageChange} className="mt-1 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20" />
            {imagePreview && <img src={imagePreview} alt="Preview" className="mt-4 max-h-48 rounded-lg" />}
          </div>
        )}

        {formSettings.fields.email.enabled && (
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700">{formSettings.fields.email.label}</label>
            <input
              type="email"
              id="email"
              name="email"
              onChange={handleInputChange}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring-primary"
              required={formSettings.fields.email.required}
            />
             {formErrors.email && <p className="text-red-500 text-sm mt-1">{formErrors.email}</p>}
          </div>
        )}

        {formSettings.fields.customFields.map(field => field.enabled && (
            <div key={field.id}>
                 <label htmlFor={field.id} className="block text-sm font-medium text-gray-700">{field.label}</label>
                 <input type="text" id={field.id} name={field.id} onChange={handleInputChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring-primary" required={field.required}/>
                 {formErrors[field.id] && <p className="text-red-500 text-sm mt-1">{formErrors[field.id]}</p>}
            </div>
        ))}

        <div>
            <label className="block text-sm font-medium text-gray-700">配信方法</label>
            <div className="mt-2 flex gap-4">
                <label className="inline-flex items-center">
                    <input type="radio" name="deliveryChoice" value="email" checked={deliveryChoice === 'email'} onChange={() => setDeliveryChoice('email')} className="focus:ring-primary h-4 w-4 text-primary border-gray-300" />
                    <span className="ml-2 text-gray-700">メール</span>
                </label>
                <label className="inline-flex items-center">
                    <input type="radio" name="deliveryChoice" value="line" checked={deliveryChoice === 'line'} onChange={() => setDeliveryChoice('line')} className="focus:ring-primary h-4 w-4 text-primary border-gray-300" disabled />
                    <span className="ml-2 text-gray-400">LINE (準備中)</span>
                </label>
            </div>
        </div>

        <div className="flex items-start">
            <div className="flex items-center h-5">
                <input id="terms" name="terms" type="checkbox" checked={agreedToTerms} onChange={(e) => setAgreedToTerms(e.target.checked)} className="focus:ring-primary h-4 w-4 text-primary border-gray-300 rounded"/>
            </div>
            <div className="ml-3 text-sm">
                <label htmlFor="terms" className="font-medium text-gray-700"><a href="#" className="text-primary hover:underline">利用規約</a>と<a href="#" className="text-primary hover:underline">プライバシーポリシー</a>に同意します。</label>
                {formErrors.terms && <p className="text-red-500 text-sm mt-1">{formErrors.terms}</p>}
            </div>
        </div>

        <button type="submit" style={{ backgroundColor: campaign.settings.design.themeColor }} className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-base font-medium text-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:bg-gray-400" disabled={isSubmitting}>
          {isSubmitting ? <Spinner /> : 'メッセージを送信'}
        </button>
      </form>
      {isSurveyOpen && (
        <SurveyModal
          survey={surveySettings}
          onClose={() => setIsSurveyOpen(false)}
          onSubmit={finalizeSubmission}
        />
      )}
    </>
  );
};

export default MessageForm;