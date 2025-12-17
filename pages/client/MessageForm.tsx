import React, { useState, useEffect } from 'react';
import { Campaign, Submission } from '../../types';
import { addSubmission, uploadFile } from '../../services/firestoreService';
import SurveyModal from './SurveyModal';
import Spinner from '../../components/common/Spinner';
import ArrowUpTrayIcon from '../../components/icons/ArrowUpTrayIcon';
import { validateEmail, sanitizeString, sanitizeFormData } from '../../utils/validation';

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
  const [hasAlreadySubmitted, setHasAlreadySubmitted] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);

  const { form: formSettings, survey: surveySettings, content } = campaign.settings;

  useEffect(() => {
    const isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (isMobile) {
        setUploadText('タップしてアップロード');
    }
    
    // Check if user has already submitted
    const submittedFlag = localStorage.getItem(`fma_submitted_${campaign.id}`);
    if (submittedFlag === 'true') {
        setHasAlreadySubmitted(true);
    }
  }, [campaign.id]);

  // Cleanup object URLs on unmount or when preview changes
  useEffect(() => {
    return () => {
      // Clean up object URL when component unmounts or preview changes
      if (imagePreview && imagePreview.startsWith('blob:')) {
        URL.revokeObjectURL(imagePreview);
      }
    };
  }, [imagePreview]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const value = e.target.value;
    const name = e.target.name;
    console.log(`[MessageForm] Input changed - ${name}:`, value);
    setFormData({ ...formData, [name]: value });
  };
  
  const validateImageFile = (file: File): string | null => {
    // Check file type
    if (!file.type.startsWith('image/')) {
      return '画像ファイルを選択してください。';
    }

    // Check file size (10MB limit)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      return 'ファイルサイズは10MB以下にしてください。';
    }

    return null;
  };
  
  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    console.log('handleImageChange called');
    
    if (!e.target.files || !e.target.files[0]) {
      console.log('No file selected');
      return;
    }

      const file = e.target.files[0];
    console.log('File selected:', file.name, file.type, file.size);
    
    // Clear previous errors
    setImageError(null);
    
    // Validate file
    const validationError = validateImageFile(file);
    if (validationError) {
      console.log('Validation error:', validationError);
      setImageError(validationError);
      e.target.value = ''; // Reset input
      setImagePreview(null);
      return;
    }

    // Create preview using URL.createObjectURL for immediate display
    // This is more reliable and faster than FileReader
    try {
      // Clean up previous object URL if it exists
      if (imagePreview && imagePreview.startsWith('blob:')) {
        URL.revokeObjectURL(imagePreview);
      }
      
      // Create object URL for immediate preview
      const objectUrl = URL.createObjectURL(file);
      console.log('Created object URL for preview:', objectUrl);
      setImagePreview(objectUrl);
      
      // Also create a data URL for storage (in case we need it)
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        if (dataUrl && dataUrl.startsWith('data:image/')) {
          // Keep the object URL for preview, but we have data URL as backup
          console.log('Data URL also created for backup');
        }
      };
      reader.readAsDataURL(file);
      
      // Start upload in background
      setUploadingImage(true);
      const timestamp = Date.now();
      const fileExtension = file.name.split('.').pop() || 'jpg';
      const filePath = `submissions/${campaign.id}/${timestamp}_${Math.random().toString(36).substring(7)}.${fileExtension}`;
      
      uploadFile(filePath, file)
        .then((downloadURL) => {
          console.log('Upload successful:', downloadURL);
          setFormData((prevData) => ({ ...prevData, imageUrl: downloadURL }));
          setImageError(null);
          // Optionally switch to Firebase Storage URL for preview, or keep object URL
          // Keeping object URL is fine for preview
        })
        .catch((uploadError) => {
          console.error("Upload failed:", uploadError);
          setImageError("画像のアップロードに失敗しましたが、プレビューは表示されています。");
        })
        .finally(() => {
          setUploadingImage(false);
        });
    } catch (err) {
      console.error('Error creating object URL:', err);
      setImageError("画像のプレビュー作成に失敗しました。");
      setImagePreview(null);
      setUploadingImage(false);
    }
  };

  const validateForm = () => {
    const errors: any = {};
    if (formSettings.fields.message.enabled && formSettings.fields.message.required && !formData.message) {
      errors.message = 'メッセージは必須です。';
    }
    
    // Email validation only if delivery channel is email OR undefined (default)
    const isEmailDelivery = campaign.deliveryChannel === 'email' || !campaign.deliveryChannel;
    const isLineDelivery = campaign.deliveryChannel === 'line';

    if (isEmailDelivery) {
        if (!formData.email) {
            errors.email = 'メールアドレスは必須です。';
        } else {
            const emailValidation = validateEmail(formData.email);
            if (!emailValidation.isValid) {
                errors.email = '有効なメールアドレスを入力してください。';
            }
        }
    }

    if (isLineDelivery) {
        if (!formData.lineId) {
            errors.lineId = 'LINE IDは必須です。';
        } else if (!formData.lineId.trim()) {
            errors.lineId = 'LINE IDを入力してください。';
        }
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
      if (campaign.deliveryChannel === 'line') {
        finalizeLineSubmission({});
      } else {
        finalizeEmailSubmission({});
      }
    }
  };

  const finalizeLineSubmission = async (surveyAnswers: any) => {
    setIsSubmitting(true);
    try {
        // Sanitize form data before submission
    const sanitizedFormData = sanitizeFormData(formData);
        
        // Calculate delivery time based on campaign type
        // Use Asia/Tokyo timezone for all date calculations
        let scheduledDeliveryTime: string;
        const submittedAt = new Date();
        
        // Helper to format date in Asia/Tokyo timezone as ISO string
        const toTokyoISOString = (date: Date): string => {
            // Convert to Asia/Tokyo timezone (UTC+9)
            const tokyoOffset = 9 * 60; // minutes
            const utc = date.getTime() + (date.getTimezoneOffset() * 60000);
            const tokyoTime = new Date(utc + (tokyoOffset * 60000));
            return tokyoTime.toISOString();
        };
        
        if (campaign.deliveryType === 'datetime' && campaign.deliveryDateTime) {
            // Use the campaign's deliveryDateTime (assume it's in Asia/Tokyo timezone)
            const deliveryDate = new Date(campaign.deliveryDateTime);
            scheduledDeliveryTime = toTokyoISOString(deliveryDate);
        } else if (campaign.deliveryType === 'interval' && campaign.deliveryIntervalDays) {
            // Calculate: submittedAt + interval days
            const deliveryDate = new Date(submittedAt);
            deliveryDate.setDate(deliveryDate.getDate() + Number(campaign.deliveryIntervalDays));
            scheduledDeliveryTime = toTokyoISOString(deliveryDate);
        } else {
            // Default: schedule for 1 day from now if no delivery type is set
            const deliveryDate = new Date(submittedAt);
            deliveryDate.setDate(deliveryDate.getDate() + 1);
            scheduledDeliveryTime = toTokyoISOString(deliveryDate);
        }
        
        // Format submittedAt in Asia/Tokyo timezone
        const submittedAtISO = toTokyoISOString(submittedAt);
        
        console.log('[MessageForm] Creating LINE submission:');
        console.log('[MessageForm] - Original formData:', formData);
        console.log('[MessageForm] - Sanitized formData:', sanitizedFormData);
        console.log('[MessageForm] - LINE ID in formData:', formData.lineId);
        console.log('[MessageForm] - LINE ID in sanitizedFormData:', sanitizedFormData.lineId);
        console.log('[MessageForm] - submittedAt (Tokyo):', submittedAtISO);
        console.log('[MessageForm] - deliveredAt (Tokyo):', scheduledDeliveryTime);
        
        // Verify LINE ID is present
        if (!sanitizedFormData.lineId || !sanitizedFormData.lineId.trim()) {
            throw new Error('LINE IDが入力されていません。');
        }
        
        const newSubmission: Omit<Submission, 'id'> = {
        campaignId: campaign.id,
        submittedAt: submittedAtISO, // Use Asia/Tokyo timezone
        deliveryChoice: 'line',
        formData: sanitizedFormData,
        surveyAnswers,
        delivered: false, // Initialize as not delivered
        deliveredAt: scheduledDeliveryTime, // Set the scheduled delivery time - ALWAYS set this field
        };
        
        console.log('[MessageForm] Submission data before sending:', JSON.stringify(newSubmission, null, 2));
        await addSubmission(newSubmission);
        console.log('[MessageForm] Submission created successfully');

        // Mark as submitted in local storage to prevent multiple submissions
        localStorage.setItem(`fma_submitted_${campaign.id}`, 'true');
        
        setSubmissionSuccess(true);
    } catch (error) {
        console.error("Error submitting message:", error);
        alert('メッセージの送信中にエラーが発生しました。');
    } finally {
        setIsSubmitting(false);
    }
  };
  
  const finalizeEmailSubmission = async (surveyAnswers: any) => {
    setIsSubmitting(true);
    try {
        // Sanitize form data before submission
        const sanitizedFormData = sanitizeFormData(formData);
        
        // Calculate delivery time based on campaign type
        // Use Asia/Tokyo timezone for all date calculations
        let scheduledDeliveryTime: string;
        const submittedAt = new Date();
        
        // Helper to format date in Asia/Tokyo timezone as ISO string
        const toTokyoISOString = (date: Date): string => {
            // Convert to Asia/Tokyo timezone (UTC+9)
            const tokyoOffset = 9 * 60; // minutes
            const utc = date.getTime() + (date.getTimezoneOffset() * 60000);
            const tokyoTime = new Date(utc + (tokyoOffset * 60000));
            return tokyoTime.toISOString();
        };
        
        if (campaign.deliveryType === 'datetime' && campaign.deliveryDateTime) {
            // Use the campaign's deliveryDateTime (assume it's in Asia/Tokyo timezone)
            const deliveryDate = new Date(campaign.deliveryDateTime);
            scheduledDeliveryTime = toTokyoISOString(deliveryDate);
        } else if (campaign.deliveryType === 'interval' && campaign.deliveryIntervalDays) {
            // Calculate: submittedAt + interval days
            const deliveryDate = new Date(submittedAt);
            deliveryDate.setDate(deliveryDate.getDate() + Number(campaign.deliveryIntervalDays));
            scheduledDeliveryTime = toTokyoISOString(deliveryDate);
        } else {
            // Default: schedule for 1 day from now if no delivery type is set
            const deliveryDate = new Date(submittedAt);
            deliveryDate.setDate(deliveryDate.getDate() + 1);
            scheduledDeliveryTime = toTokyoISOString(deliveryDate);
        }
        
        // Format submittedAt in Asia/Tokyo timezone
        const submittedAtISO = toTokyoISOString(submittedAt);
        
        console.log('[MessageForm] Creating submission:');
        console.log('[MessageForm] - submittedAt (Tokyo):', submittedAtISO);
        console.log('[MessageForm] - deliveredAt (Tokyo):', scheduledDeliveryTime);
        
        const newSubmission: Omit<Submission, 'id'> = {
        campaignId: campaign.id,
        submittedAt: submittedAtISO, // Use Asia/Tokyo timezone
        deliveryChoice: 'email',
        formData: sanitizedFormData,
        surveyAnswers,
        delivered: false, // Initialize as not delivered
        deliveredAt: scheduledDeliveryTime, // Set the scheduled delivery time - ALWAYS set this field
        };
        
        console.log('[MessageForm] Submission data before sending:', JSON.stringify(newSubmission, null, 2));
        await addSubmission(newSubmission);
        console.log('[MessageForm] Submission created successfully');
        
        // Mark as submitted in local storage to prevent multiple submissions
        localStorage.setItem(`fma_submitted_${campaign.id}`, 'true');
        
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
          // Ensure deliveryIntervalDays is treated as a number
          deliveryDate.setDate(deliveryDate.getDate() + Number(campaign.deliveryIntervalDays));
          return `メッセージは ${deliveryDate.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })} 頃に配信予定です。`;
      }
      return 'メッセージは後日配信されます。';
  };
  
  if (hasAlreadySubmitted) {
      return (
        <div className="text-center p-8 border-2 border-dashed border-gray-300 rounded-lg bg-gray-50">
            <h2 className="text-xl font-bold text-gray-700">既に参加済みです</h2>
            <p className="text-gray-600 mt-2">
                このキャンペーンへのメッセージは既に送信されています。<br/>
                ご参加ありがとうございました。
            </p>
        </div>
      );
  }

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
                className="mt-2 flex justify-center items-center rounded-lg border border-dashed border-gray-900/25 px-6 py-8 text-center relative cursor-pointer hover:border-primary hover:bg-gray-50 transition-all group"
                onClick={() => {
                  if (!uploadingImage) {
                    const fileInput = document.getElementById('image') as HTMLInputElement;
                    if (fileInput) {
                      fileInput.click();
                    }
                  }
                }}
            >
                <input 
                  type="file" 
                  id="image" 
                  name="image" 
                  accept="image/*" 
                  onChange={handleImageChange} 
                  className="sr-only" 
                  disabled={uploadingImage}
                />
                {imagePreview ? (
                     <div className="flex flex-col items-center w-full">
                        <div className="relative w-full flex justify-center bg-white rounded-lg p-4 border border-gray-200 min-h-[200px]">
                            <img 
                              key={imagePreview.substring(0, 50)} 
                              src={imagePreview} 
                              alt="Preview" 
                              className="rounded-lg shadow-md" 
                              style={{ 
                                display: 'block',
                                maxWidth: '100%',
                                maxHeight: '256px',
                                width: 'auto',
                                height: 'auto',
                                objectFit: 'contain',
                                backgroundColor: 'white'
                              }}
                              onError={(e) => {
                                console.error("IMG onError - Failed to load preview");
                                console.error("URL exists:", !!imagePreview);
                                if (imagePreview) {
                                  console.error("URL length:", imagePreview.length);
                                  console.error("URL start:", imagePreview.substring(0, 100));
                                }
                                const target = e.target as HTMLImageElement;
                                target.style.backgroundColor = '#f3f4f6';
                                target.style.display = 'none';
                                setImageError("画像のプレビューに失敗しました。");
                              }}
                              onLoad={(e) => {
                                console.log("IMG onLoad - Preview loaded successfully");
                                const target = e.target as HTMLImageElement;
                                console.log("Dimensions:", target.naturalWidth, "x", target.naturalHeight);
                                target.style.display = 'block';
                                target.style.opacity = '1';
                                setImageError(null);
                              }}
                            />
                            {uploadingImage && (
                              <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-90 rounded-lg">
                                <div className="bg-white rounded-lg p-4 flex flex-col items-center border border-gray-200">
                                  <Spinner />
                                  <p className="mt-2 text-sm text-gray-700">アップロード中...</p>
                                </div>
                              </div>
                            )}
                        </div>
                        <p className="mt-4 text-sm font-medium text-primary bg-white px-4 py-2 rounded-full shadow-sm border border-gray-200 flex items-center gap-2 group-hover:bg-primary group-hover:text-white transition-colors cursor-pointer">
                             <ArrowUpTrayIcon className="w-4 h-4" />
                             写真を変更する
                        </p>
                    </div>
                ) : uploadingImage ? (
                  <div className="flex flex-col items-center">
                    <Spinner />
                    <p className="mt-2 text-sm text-gray-600">処理中...</p>
                    </div>
                ) : (
                    <div>
                        <ArrowUpTrayIcon className="mx-auto h-12 w-12 text-gray-300 group-hover:text-primary transition-colors" />
                        <p className="mt-2 text-sm text-gray-600">
                            <span className="font-semibold" style={{ color: campaign.settings.design.themeColor }}>{uploadText}</span>
                        </p>
                        <p className="text-xs text-gray-500">またはファイルをドラッグ</p>
                        <p className="text-xs text-gray-400 mt-1">対応形式: JPEG, PNG, GIF (最大5MB)</p>
                    </div>
                )}
            </div>
            {imageError && (
              <p className="mt-1 text-sm text-red-600">{imageError}</p>
            )}
          </div>
        )}

        <div>
            <label className="block text-sm font-medium text-gray-700">配信方法</label>
            <div className="mt-1 text-gray-800 p-3 bg-gray-100 rounded-md">
                {campaign.deliveryChannel === 'email' ? 'メール' : 'LINE'}
            </div>
        </div>
        
        {/* LINE ID input field - User enters the LINE User ID of the recipient
            Testing: Get LINE User ID from LINE Developers Console or by having a user message your bot
            Format: Usually starts with 'U' followed by alphanumeric characters (e.g., U1234567890abcdef...) */}
        {campaign.deliveryChannel === 'line' && (
            <div>
                <label htmlFor="lineId" className="block text-sm font-medium text-gray-700">LINE ID</label>
                <input
                    type="text"
                    id="lineId"
                    name="lineId"
                    value={formData.lineId || ''}
                    onChange={handleInputChange}
                    className="mt-1 block w-full p-3 rounded-md border border-gray-300 shadow-sm focus:border-primary focus:ring-2 focus:ring-primary/50"
                    required
                    placeholder="LINEユーザーIDを入力してください"
                />
                {formErrors.lineId && <p className="text-red-500 text-sm mt-1">{formErrors.lineId}</p>}
                <div className="mt-2 p-3 text-sm text-sky-800 bg-sky-100 border-l-4 border-sky-500 rounded-r-md">
                <p className="font-semibold">LINEでメッセージを受け取るには</p>
                    <p className="mt-1">指定したLINE IDのアカウントが、このキャンペーンのLINE公式アカウントを友だち追加している必要があります。</p>
                </div>
            </div>
        )}
        
        {campaign.deliveryChannel === 'email' && (
          <div className="p-3 text-sm text-sky-800 bg-sky-100 border-l-4 border-sky-500 rounded-r-md">
            <p className="font-semibold">メールでメッセージを受け取るには</p>
            <p className="mt-1">迷惑メールフォルダに振り分けられることがあります。{campaign.settings.form.fromEmail && `「${campaign.settings.form.fromEmail}」`}からのメールを受信できるよう設定してください。</p>
          </div>
        )}

        {campaign.deliveryChannel === 'email' && (
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700">{formSettings.fields.email.label}</label>
            <input
              type="email"
              id="email"
              name="email"
              onChange={handleInputChange}
              className="mt-1 block w-full p-3 rounded-md border border-gray-300 shadow-sm focus:border-primary focus:ring-2 focus:ring-primary/50"
              required
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
          {isSubmitting ? <Spinner /> : 'メッセージを送信'}
        </button>
      </form>

      {isSurveyOpen && (
        <>
        <SurveyModal
          survey={surveySettings}
          onClose={() => setIsSurveyOpen(false)}
          onSubmit={campaign.deliveryChannel === 'line' ? finalizeLineSubmission : finalizeEmailSubmission}
        />
        <div style={{position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0, 0, 0, 0.5)'}}></div>
      </>
      )}
      {modalContent && (
        <>
        <div className="fixed inset-0 flex items-center justify-center z-50 p-4 transition-opacity duration-300 pointer-events-none" aria-modal="true" role="dialog">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col transform transition-all duration-300 animate-fade-in-scale pointer-events-auto relative z-10">
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
        <div style={{position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0, 0, 0, 0.5)'}}></div>
      </>
      )}
      {submissionSuccess && (
        <>
        <div className="fixed inset-0 flex items-center justify-center z-50 p-4 transition-opacity duration-300 pointer-events-none" aria-modal="true" role="dialog">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-8 text-center animate-fade-in-scale pointer-events-auto relative z-10">
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
        <div style={{position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0, 0, 0, 0.5)'}}></div>
      </>
      )}
    </>
  );
};

export default MessageForm;