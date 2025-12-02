import React, { useState, useEffect, ChangeEvent } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Campaign, CustomFieldSetting, Submission, SurveyQuestion, FaqItem, HowToSettings, Host } from '../../types';
import { getCampaign, addCampaign, updateCampaign, getSubmissionsForCampaign, uploadFile, getClient } from '../../services/firestoreService';
import TrashIcon from '../../components/icons/TrashIcon';
import Spinner from '../../components/common/Spinner';
import PlusIcon from '../../components/icons/PlusIcon';
import ClipboardIcon from '../../components/icons/ClipboardIcon';
import CampaignDashboard from '../../components/admin/CampaignDashboard';
import Breadcrumbs from '../../components/common/Breadcrumbs';

const ImageUpload: React.FC<{
  label: string;
  currentImageUrl: string;
  onImageUploaded: (url: string) => void;
  campaignId: string;
  path: string;
}> = ({ label, currentImageUrl, onImageUploaded, campaignId, path }) => {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(currentImageUrl);

  useEffect(() => {
    setPreview(currentImageUrl);
  }, [currentImageUrl]);

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploading(true);
      try {
        const filePath = `campaigns/${campaignId}/${path}/${Date.now()}_${file.name}`;
        const downloadURL = await uploadFile(filePath, file);
        onImageUploaded(downloadURL);
        setPreview(downloadURL);
      } catch (error) {
        console.error("Image upload failed:", error);
        alert("画像のアップロードに失敗しました。");
      } finally {
        setUploading(false);
      }
    }
  };

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <div className="mt-1 flex items-center gap-4">
        {preview && (
          <img src={preview} alt="Preview" className="w-32 h-16 object-cover rounded-md bg-gray-100" />
        )}
        <input
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          disabled={uploading}
          className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
        />
        {uploading && <Spinner />}
      </div>
    </div>
  );
};


const CampaignEditor: React.FC = () => {
  const { clientId, id } = useParams<{ clientId: string; id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [participants, setParticipants] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [clientName, setClientName] = useState('');
  
  const MENU_ITEMS = id ? ['ダッシュボード', '基本設定', 'フォーム設定', 'アンケート設定', 'デザイン設定', 'コンテンツ設定'] : ['基本設定', 'フォーム設定', 'アンケート設定', 'デザイン設定', 'コンテンツ設定'];
  const [activeMenu, setActiveMenu] = useState(location.state?.defaultTab || MENU_ITEMS[0]);
  
  const createNewCampaign = (clientId: string): Campaign => ({
    id: `new_${Date.now()}`,
    clientId,
    name: '',
    description: '',
    publishStart: '',
    publishEnd: '',
    submissionStart: new Date().toISOString().slice(0, 16),
    submissionEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16),
    deliveryType: 'datetime',
    deliveryDateTime: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16),
    deliveryChannel: 'email',
    lineChannelId: '',
    lineChannelSecret: '',
    lineMessage: '',
    emailTemplate: { subject: '', body: '' },
    settings: {
        form: { fields: { message: {enabled: true, required: true, label: "未来へのメッセージ"}, image: {enabled: true, required: false, label: "思い出の写真"}, email: {enabled: true, required: true, label: "メールアドレス"}, customFields: []}, fromEmail: ''},
        survey: { enabled: true, questions: [] },
        design: { mainVisualUrl: '', themeColor: '#0284c7', backgroundColor: '#f0f9ff', backgroundImageUrl: '', showTitle: true },
        content: { 
            showHowTo: true,
            howTo: { type: 'steps', steps: [], freeText: { text: '', imageUrl: ''} }, 
            showFaq: true,
            faq: [], 
            showHosts: true,
            hosts: [], 
            terms: '', 
            privacy: '', 
            footer: { textLinks: [], showBanners: true, bannerLinks: [], copyright: `© ${new Date().getFullYear()} Future Message App` } 
        }
    }
  });

  useEffect(() => {
    const fetchData = async () => {
        try {
            let fetchedCampaign: any | null = null;
            let fetchedClientName: string | null = location.state?.clientName;
            
            if (id) {
                const [campaignData, participantsData] = await Promise.all([
                    getCampaign(id),
                    getSubmissionsForCampaign(id),
                ]);
                setParticipants(participantsData);
                fetchedCampaign = campaignData;

                if (fetchedCampaign && !fetchedClientName) {
                    const client = await getClient(fetchedCampaign.clientId);
                    fetchedClientName = client?.name || null;
                }

            } else {
                if (!clientId) {
                    alert("クライアントが選択されていません。");
                    navigate('/admin/clients');
                    return;
                }
                fetchedCampaign = createNewCampaign(clientId);
                if (!fetchedClientName) {
                    const client = await getClient(clientId);
                    fetchedClientName = client?.name || null;
                }
            }
            
            if (fetchedCampaign) {
                const defaultCampaign = createNewCampaign(fetchedCampaign.clientId);
                
                const mergedSettings = {
                    ...defaultCampaign.settings,
                    ...fetchedCampaign.settings,
                    form: { ...defaultCampaign.settings.form, ...(fetchedCampaign.settings.form || {}), fields: { ...defaultCampaign.settings.form.fields, ...(fetchedCampaign.settings.form?.fields || {})}},
                    survey: { ...defaultCampaign.settings.survey, ...(fetchedCampaign.settings.survey || {})},
                    design: { ...defaultCampaign.settings.design, ...(fetchedCampaign.settings.design || {})},
                    content: {
                      ...defaultCampaign.settings.content,
                      ...(fetchedCampaign.settings.content || {}),
                      howTo: { ...defaultCampaign.settings.content.howTo, ...(fetchedCampaign.settings.content?.howTo || {})},
                      hosts: fetchedCampaign.settings.content?.hosts || defaultCampaign.settings.content.hosts,
                      faq: fetchedCampaign.settings.content?.faq || defaultCampaign.settings.content.faq,
                      footer: {
                        ...defaultCampaign.settings.content.footer,
                        ...(fetchedCampaign.settings.content?.footer || {}),
                        textLinks: fetchedCampaign.settings.content?.footer?.textLinks || defaultCampaign.settings.content.footer.textLinks,
                        bannerLinks: fetchedCampaign.settings.content?.footer?.bannerLinks || defaultCampaign.settings.content.footer.bannerLinks,
                      }
                    }
                };

                if (fetchedCampaign.settings.content?.organizer && !fetchedCampaign.settings.content.hosts) {
                  mergedSettings.content.hosts = [{ id: 'migrated0', name: fetchedCampaign.settings.content.organizer.name, url: fetchedCampaign.settings.content.organizer.url }];
                }
                delete mergedSettings.content.organizer;
                delete mergedSettings.content.showOrganizer;

                const mergedCampaign = { ...defaultCampaign, ...fetchedCampaign, settings: mergedSettings };
                setCampaign(mergedCampaign);
                setClientName(fetchedClientName || '');
            } else if (id) {
                alert("指定されたキャンペーンが見つかりません。");
                navigate('/admin/clients');
            }
        } catch (error) {
            console.error("Failed to fetch data", error);
            alert("データの読み込みに失敗しました。");
        } finally {
            setLoading(false);
        }
    };
    fetchData();
  }, [id, clientId, navigate, location.state]);
  
  useEffect(() => {
    if (clientName && campaign) {
      document.title = `管理画面｜${clientName}｜${campaign.name || '新規キャンペーン作成'}`;
    }
  }, [clientName, campaign?.name]);


  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    const checked = type === 'checkbox' ? (e.target as HTMLInputElement).checked : undefined;
    
    setCampaign(prev => {
        if (!prev) return null;
        const newCampaign = JSON.parse(JSON.stringify(prev)); // Deep copy
        let current: any = newCampaign;
        const keys = name.split('.');
        for (let i = 0; i < keys.length - 1; i++) {
            if (current[keys[i]] === undefined || current[keys[i]] === null) {
              current[keys[i]] = {}; // Create nested object if it doesn't exist
            }
            current = current[keys[i]];
        }
        current[keys[keys.length - 1]] = checked !== undefined ? checked : value;
        return newCampaign;
    });
  };

  const handleNestedChange = (name: string, value: any) => {
    handleChange({ target: { name, value } } as any);
  };
  
  const handleSave = async () => {
    if (!campaign) return;
    setSaving(true);
    try {
        const { id: campaignId, ...campaignData } = campaign;
        if (id) {
            await updateCampaign(id, campaignData);
            alert("キャンペーンが正常に保存されました。");
        } else {
            const campaignToSave: Omit<Campaign, 'id'> = { ...campaignData };
            const newId = await addCampaign(campaignToSave);
            alert("キャンペーンが作成されました。");
            navigate(`/admin/clients/${campaign.clientId}/campaigns/edit/${newId}`, { replace: true, state: { clientName } });
        }
    } catch (error) {
        console.error("Failed to save campaign:", error);
        alert("保存に失敗しました。")
    } finally {
        setSaving(false);
    }
  };
  
  const handleStepChange = (index: number, field: keyof HowToSettings['steps'][0], value: string) => {
    if (!campaign) return;

    setCampaign(prev => {
      if (!prev) return null;
      const newCampaign = JSON.parse(JSON.stringify(prev));
      (newCampaign.settings.content.howTo.steps[index] as any)[field] = value;
      return newCampaign;
    });
  };
  
  const handleAddStep = () => {
    if (!campaign) return;
    const newStep = {id: `step${Date.now()}`, title: '', text: '', imageUrl: ''};
    const newSteps = [...campaign.settings.content.howTo.steps, newStep];
    handleNestedChange('settings.content.howTo.steps', newSteps);
  };

  const handleDeleteStep = (indexToDelete: number) => {
    if (!campaign) return;
    const newSteps = campaign.settings.content.howTo.steps.filter((_, index) => index !== indexToDelete);
    handleNestedChange('settings.content.howTo.steps', newSteps);
  };

  const handleHostChange = (index: number, field: keyof Host, value: string) => {
    if (!campaign) return;
    const updatedHosts = [...campaign.settings.content.hosts];
    updatedHosts[index][field] = value;
    handleNestedChange('settings.content.hosts', updatedHosts);
  };

  const handleAddHost = () => {
    if (!campaign) return;
    const newHost = { id: `host${Date.now()}`, name: '', url: '' };
    handleNestedChange('settings.content.hosts', [...campaign.settings.content.hosts, newHost]);
  };

  const handleDeleteHost = (index: number) => {
    if (!campaign) return;
    const updatedHosts = campaign.settings.content.hosts.filter((_, i) => i !== index);
    handleNestedChange('settings.content.hosts', updatedHosts);
  };

  if (loading) return <div className="flex justify-center items-center h-full"><Spinner /></div>;
  if (!campaign) return <div>Campaign not found or client not specified.</div>;
  
  const campaignUrl = id ? `${window.location.origin}/campaign/${id}` : null;

  const breadcrumbItems = clientName && campaign ? [
    { label: 'クライアント管理', path: '/admin/clients' },
    { label: clientName, path: `/admin/clients/${campaign.clientId}/campaigns` },
    { label: campaign.name || (id ? 'キャンペーン編集' : '新規キャンペーン作成') }
  ] : [];
  
  const renderMenuContent = () => {
    switch (activeMenu) {
      case 'ダッシュボード':
        return <CampaignDashboard campaign={campaign} participants={participants} />;
      case '基本設定':
        return (
            <div className="space-y-4">
                <input name="name" value={campaign.name} onChange={handleChange} placeholder="キャンペーン名" className="w-full p-2 border rounded"/>
                <textarea name="description" value={campaign.description} onChange={handleChange} placeholder="キャンペーン概要" className="w-full p-2 border rounded" />
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="text-sm font-medium text-gray-700">受付開始日時</label>
                        <input type="datetime-local" name="submissionStart" value={campaign.submissionStart} onChange={handleChange} className="w-full p-2 border rounded"/>
                    </div>
                     <div>
                        <label className="text-sm font-medium text-gray-700">受付終了日時</label>
                        <input type="datetime-local" name="submissionEnd" value={campaign.submissionEnd} onChange={handleChange} className="w-full p-2 border rounded" />
                    </div>
                </div>
                
                <h3 className="text-lg font-semibold pt-4 border-t mt-4">メッセージ配信設定</h3>
                
                <div>
                  <label className="text-sm font-medium text-gray-700">配信チャネル</label>
                  <select name="deliveryChannel" value={campaign.deliveryChannel || 'email'} onChange={handleChange} className="w-full p-2 border rounded mt-1">
                      <option value="email">メール配信</option>
                      <option value="line">LINE配信</option>
                  </select>
                </div>

                {(campaign.deliveryChannel === 'email') && (
                    <div className="mt-4 p-4 border rounded-md bg-sky-50 space-y-2">
                        <h4 className="font-semibold text-gray-800">メール配信テンプレート</h4>
                        <div>
                            <label htmlFor="emailSubject" className="block text-sm font-medium text-gray-700">件名</label>
                            <input
                                id="emailSubject"
                                name="emailTemplate.subject"
                                value={campaign.emailTemplate?.subject || ''}
                                onChange={handleChange}
                                placeholder="未来のあなたからメッセージが届きました"
                                className="w-full p-2 border rounded mt-1"
                            />
                        </div>
                        <div>
                            <label htmlFor="emailBody" className="block text-sm font-medium text-gray-700">本文</label>
                            <textarea
                                id="emailBody"
                                name="emailTemplate.body"
                                value={campaign.emailTemplate?.body || ''}
                                onChange={handleChange}
                                placeholder="未来のあなたからのメッセージをお届けします。"
                                className="w-full p-2 border rounded mt-1"
                                rows={6}
                            />
                            <p className="text-xs text-gray-500 mt-1">※メッセージの本文の先頭に、ユーザーがメッセージを投稿した日時が自動的に挿入されます。</p>
                        </div>
                    </div>
                )}
                {(campaign.deliveryChannel === 'line') && (
                    <div className="mt-4 p-4 border rounded-md bg-sky-50 space-y-4">
                        <h4 className="font-semibold text-gray-800">LINE配信設定</h4>
                        <div>
                            <label htmlFor="lineMessage" className="block text-sm font-medium text-gray-700 mb-1">配信メッセージ</label>
                             <p className="text-xs text-gray-500 mb-2">LINEで配信するには、ユーザーがLINE認証を行い、指定されたアカウントを友だち追加する必要があります。</p>
                            <textarea 
                                id="lineMessage"
                                name="lineMessage" 
                                value={campaign.lineMessage || ''} 
                                onChange={handleChange} 
                                placeholder="未来のあなたからのメッセージが届きました！" 
                                className="w-full p-2 border rounded" 
                                rows={4}
                            />
                            <p className="text-xs text-gray-500 mt-1">※メッセージの本文の先頭に、ユーザーがメッセージを投稿した日時が自動的に挿入されます。</p>
                        </div>

                        <div className="p-4 border-t border-sky-200">
                             <h5 className="font-semibold text-gray-800 mb-2">LINEチャンネル設定</h5>
                             <div>
                                <label htmlFor="lineChannelId" className="block text-sm font-medium text-gray-700">チャンネルID</label>
                                <input
                                    id="lineChannelId"
                                    name="lineChannelId"
                                    value={campaign.lineChannelId || ''}
                                    onChange={handleChange}
                                    placeholder="LINE Developersから取得したチャンネルID"
                                    className="w-full p-2 border rounded mt-1"
                                />
                            </div>
                            <div className="mt-2">
                                <label htmlFor="lineChannelSecret" className="block text-sm font-medium text-gray-700">チャンネルシークレット</label>
                                <input
                                    id="lineChannelSecret"
                                    name="lineChannelSecret"
                                    type="password"
                                    value={campaign.lineChannelSecret || ''}
                                    onChange={handleChange}
                                    placeholder="LINE Developersから取得したチャンネルシークレット"
                                    className="w-full p-2 border rounded mt-1"
                                />
                                 <p className="text-xs text-amber-700 bg-amber-100 p-2 rounded-md mt-2">
                                    <strong>注意:</strong> チャンネルシークレットは機密情報です。本番環境では、バックエンドサーバーで安全に管理することを強く推奨します。
                                </p>
                            </div>
                             <div className="mt-4">
                                <p className="text-sm font-medium text-gray-700">コールバックURLの設定</p>
                                <p className="text-xs text-gray-600 mt-1">LINE Developersコンソールのチャンネル設定で、以下のコールバックURLを登録してください。</p>
                                <div className="mt-2 p-2 bg-gray-100 rounded-md text-sm text-gray-800 font-mono break-all">
                                    {`${window.location.origin}/line/callback`}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
                
                <h4 className="text-md font-semibold pt-4">メッセージ配信日時</h4>
                 <select name="deliveryType" value={campaign.deliveryType} onChange={handleChange} className="w-full p-2 border rounded">
                     <option value="datetime">特定の日時</option>
                     <option value="interval">間隔</option>
                 </select>
                 {campaign.deliveryType === 'datetime' ? (
                     <div>
                        <label className="text-sm font-medium text-gray-700">配信日時</label>
                        <input type="datetime-local" name="deliveryDateTime" value={campaign.deliveryDateTime || ''} onChange={handleChange} className="w-full p-2 border rounded"/>
                     </div>
                 ) : (
                     <div>
                        <label className="text-sm font-medium text-gray-700">配信間隔（日数）</label>
                        <input type="number" name="deliveryIntervalDays" value={campaign.deliveryIntervalDays || ''} onChange={handleChange} placeholder="例: 365" className="w-full p-2 border rounded"/>
                     </div>
                 )}
            </div>
        );
      case 'フォーム設定':
          const { customFields } = campaign.settings.form.fields;
          return (
             <div className="space-y-4">
                <h3 className="text-lg font-semibold">フォーム項目</h3>
                {Object.entries(campaign.settings.form.fields).map(([key, value]) => {
                    if (key === 'customFields') return null;
                    const field = value as {enabled: boolean, required: boolean, label: string};
                    return (
                        <div key={key} className="flex items-center gap-4 p-2 border rounded bg-gray-50">
                            <input type="checkbox" id={`field-enabled-${key}`} name={`settings.form.fields.${key}.enabled`} checked={field.enabled} onChange={handleChange} className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"/>
                            <label htmlFor={`field-enabled-${key}`} className="font-medium flex-1">{field.label}</label>
                            <label htmlFor={`field-required-${key}`} className="text-sm">必須:</label>
                            <input type="checkbox" id={`field-required-${key}`} name={`settings.form.fields.${key}.required`} checked={field.required} onChange={handleChange} disabled={!field.enabled} className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"/>
                        </div>
                    )
                })}
                <h3 className="text-lg font-semibold mt-6">カスタム項目</h3>
                {customFields.map((field, index) => (
                    <div key={field.id} className="flex items-center gap-2 p-2 border rounded">
                        <input type="text" value={field.label} onChange={(e) => {
                            const updated = [...customFields];
                            updated[index].label = e.target.value;
                            handleNestedChange('settings.form.fields.customFields', updated);
                        }} placeholder="項目ラベル" className="p-2 border rounded flex-grow"/>
                        <label>必須:</label>
                        <input type="checkbox" checked={field.required} onChange={(e) => {
                             const updated = [...customFields];
                             updated[index].required = e.target.checked;
                             handleNestedChange('settings.form.fields.customFields', updated);
                        }} />
                        <button onClick={() => {
                            const updated = customFields.filter((_, i) => i !== index);
                            handleNestedChange('settings.form.fields.customFields', updated);
                        }} className="p-2 text-red-500 hover:text-red-700"><TrashIcon /></button>
                    </div>
                ))}
                <button type="button" onClick={() => {
                    const newField: CustomFieldSetting = { id: `cf${Date.now()}`, type: 'text', label: '', enabled: true, required: false };
                    handleNestedChange('settings.form.fields.customFields', [...customFields, newField]);
                }} className="text-primary hover:underline">カスタム項目を追加</button>
             </div>
          );
      case 'アンケート設定':
          const { questions } = campaign.settings.survey;
          return (
            <div className="space-y-4">
                <label className="flex items-center gap-2">
                    <input type="checkbox" name="settings.survey.enabled" checked={campaign.settings.survey.enabled} onChange={handleChange} className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary" />
                    <span>アンケートを有効にする</span>
                </label>
                {campaign.settings.survey.enabled && (
                    <div className="space-y-4">
                        {questions.map((q, index) => (
                            <div key={q.id} className="p-4 border rounded-md space-y-2 bg-gray-50">
                                <div className="flex justify-between items-center">
                                    <label className="font-semibold">質問 #{index + 1}</label>
                                    <button onClick={() => {
                                        const updated = questions.filter((_, i) => i !== index);
                                        handleNestedChange('settings.survey.questions', updated);
                                    }} className="text-red-500 hover:text-red-700"><TrashIcon /></button>
                                </div>
                                <textarea value={q.text} onChange={(e) => {
                                    const updated = [...questions];
                                    updated[index].text = e.target.value;
                                    handleNestedChange('settings.survey.questions', updated);
                                }} placeholder="質問文" className="w-full p-2 border rounded" rows={2}/>
                                <div className="flex items-center gap-4">
                                    <select value={q.type} onChange={(e) => {
                                        const updated = [...questions];
                                        updated[index].type = e.target.value as SurveyQuestion['type'];
                                        handleNestedChange('settings.survey.questions', updated);
                                    }} className="p-2 border rounded w-full">
                                        <option value="text">一行入力</option>
                                        <option value="textarea">複数行入力</option>
                                        <option value="radio">ラジオボタン</option>
                                        <option value="checkbox">チェックボックス</option>
                                        <option value="select">プルダウン</option>
                                    </select>
                                    <label className="flex items-center gap-2 text-sm flex-shrink-0">
                                        <input type="checkbox" checked={q.required} onChange={(e) => {
                                            const updated = [...questions];
                                            updated[index].required = e.target.checked;
                                            handleNestedChange('settings.survey.questions', updated);
                                        }} />
                                        <span>必須項目</span>
                                    </label>
                                </div>
                                {['radio', 'checkbox', 'select'].includes(q.type) && (
                                    <div className="pl-4 mt-2 space-y-2">
                                        <label className="text-sm font-medium">選択肢:</label>
                                        {(q.options || []).map((opt, optIndex) => (
                                            <div key={optIndex} className="flex items-center gap-2">
                                                <input type="text" value={opt} onChange={(e) => {
                                                    const updated = [...questions];
                                                    const newOptions = [...(updated[index].options || [])];
                                                    newOptions[optIndex] = e.target.value;
                                                    updated[index].options = newOptions;
                                                    handleNestedChange('settings.survey.questions', updated);

                                                }} className="w-full p-1 border rounded" />
                                                <button onClick={() => {
                                                    const updated = [...questions];
                                                    updated[index].options = (updated[index].options || []).filter((_, i) => i !== optIndex);
                                                    handleNestedChange('settings.survey.questions', updated);
                                                }} className="text-red-500"><TrashIcon className="w-4 h-4" /></button>
                                            </div>
                                        ))}
                                        <button type="button" onClick={() => {
                                            const updated = [...questions];
                                            updated[index].options = [...(updated[index].options || []), ''];
                                            handleNestedChange('settings.survey.questions', updated);
                                        }} className="text-sm text-primary hover:underline">+ 選択肢を追加</button>
                                    </div>
                                )}
                            </div>
                        ))}
                        <button type="button" onClick={() => {
                            const newQuestion: SurveyQuestion = { id: `q${Date.now()}`, text: '', type: 'text', required: false, options: [] };
                            handleNestedChange('settings.survey.questions', [...questions, newQuestion]);
                        }} className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary border border-transparent rounded-md shadow-sm hover:bg-primary-hover">
                            <PlusIcon className="w-4 h-4" /> 質問を追加
                        </button>
                    </div>
                )}
            </div>
          );
      case 'デザイン設定':
          return (
            <div className="space-y-4">
                <ImageUpload label="メインビジュアル" currentImageUrl={campaign.settings.design.mainVisualUrl} onImageUploaded={url => handleNestedChange('settings.design.mainVisualUrl', url)} campaignId={campaign.id} path="visual" />
                <ImageUpload label="背景画像" currentImageUrl={campaign.settings.design.backgroundImageUrl} onImageUploaded={url => handleNestedChange('settings.design.backgroundImageUrl', url)} campaignId={campaign.id} path="background" />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">テーマカラー</label>
                         <div className="flex items-center gap-2 mt-1">
                             <input type="color" name="settings.design.themeColor" value={campaign.settings.design.themeColor} onChange={handleChange} className="h-10 w-10 p-1 border rounded"/>
                             <input type="text" name="settings.design.themeColor" value={campaign.settings.design.themeColor} onChange={handleChange} placeholder="#0284c7" className="w-full p-2 border rounded"/>
                         </div>
                    </div>
                     <div>
                        <label className="block text-sm font-medium text-gray-700">背景色</label>
                        <div className="flex items-center gap-2 mt-1">
                            <input type="color" name="settings.design.backgroundColor" value={campaign.settings.design.backgroundColor} onChange={handleChange} className="h-10 w-10 p-1 border rounded"/>
                            <input type="text" name="settings.design.backgroundColor" value={campaign.settings.design.backgroundColor} onChange={handleChange} placeholder="#f0f9ff" className="w-full p-2 border rounded"/>
                        </div>
                    </div>
                </div>
                 <div className="mt-4 pt-4 border-t">
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input 
                            type="checkbox" 
                            name="settings.design.showTitle" 
                            checked={campaign.settings.design.showTitle ?? true} 
                            onChange={handleChange} 
                            className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                        />
                        <span className="text-sm font-medium text-gray-700">キャンペーンタイトルをページに表示する</span>
                    </label>
                </div>
            </div>
          );
      case 'コンテンツ設定':
        const { howTo, faq, hosts, footer } = campaign.settings.content;
        return (
            <div className="space-y-6">
                 <div className="p-4 border rounded-md">
                    <label className="flex items-center gap-2 font-semibold">
                        <input type="checkbox" name="settings.content.showHowTo" checked={campaign.settings.content.showHowTo ?? true} onChange={handleChange} className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary" />
                        <span>参加方法セクションを表示する</span>
                    </label>
                    {campaign.settings.content.showHowTo && <div className="mt-4 pl-6 space-y-4">
                        <div className="flex gap-4 mb-2">
                            <label><input type="radio" value="steps" checked={howTo.type === 'steps'} onChange={() => handleNestedChange('settings.content.howTo.type', 'steps')} /> ステップ形式</label>
                            <label><input type="radio" value="free" checked={howTo.type === 'free'} onChange={() => handleNestedChange('settings.content.howTo.type', 'free')} /> 自由入力</label>
                        </div>
                        {howTo.type === 'steps' ? (
                            <div className="space-y-2">
                                {howTo.steps.map((step, index) => (
                                    <div key={step.id} className="p-4 border rounded-md space-y-2 bg-gray-50">
                                        <div className="flex justify-between items-start">
                                            <div className="flex-grow">
                                                <div className="flex items-center gap-4">
                                                    <span className="font-bold text-xl text-primary">{index + 1}.</span>
                                                    <input type="text" placeholder="タイトル" value={step.title} onChange={e => handleStepChange(index, 'title', e.target.value)} className="w-full p-2 border rounded" />
                                                </div>
                                                <textarea placeholder="説明文" value={step.text} onChange={e => handleStepChange(index, 'text', e.target.value)} className="w-full p-2 border rounded mt-2" rows={3}/>
                                                <ImageUpload label="画像" currentImageUrl={step.imageUrl} onImageUploaded={url => handleStepChange(index, 'imageUrl', url)} campaignId={campaign.id} path={`howto-step-${step.id}`} />
                                            </div>
                                            <button onClick={() => handleDeleteStep(index)} className="text-red-500 ml-2 flex-shrink-0"><TrashIcon /></button>
                                        </div>
                                    </div>
                                ))}
                                <button type="button" onClick={handleAddStep} className="text-primary hover:underline">+ ステップを追加</button>
                            </div>
                        ) : (
                            <div className="p-4 border rounded-md space-y-2 bg-gray-50">
                            <textarea value={howTo.freeText.text} onChange={(e) => handleNestedChange('settings.content.howTo.freeText.text', e.target.value)} className="w-full p-2 border rounded" rows={5}/>
                            <ImageUpload label="画像" currentImageUrl={howTo.freeText.imageUrl} onImageUploaded={url => handleNestedChange('settings.content.howTo.freeText.imageUrl', url)} campaignId={campaign.id} path="howto-free" />
                            </div>
                        )}
                    </div>}
                </div>

                <div className="p-4 border rounded-md">
                     <label className="flex items-center gap-2 font-semibold">
                        <input type="checkbox" name="settings.content.showFaq" checked={campaign.settings.content.showFaq ?? true} onChange={handleChange} className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary" />
                        <span>よくある質問セクションを表示する</span>
                    </label>
                    {campaign.settings.content.showFaq && <div className="mt-4 pl-6 space-y-2">
                        {faq.map((item, index) => (
                            <div key={item.id} className="p-4 border rounded-md space-y-2 bg-gray-50">
                                <div className="flex justify-end">
                                    <button onClick={() => {
                                        const updated = faq.filter((_, i) => i !== index);
                                        handleNestedChange('settings.content.faq', updated);
                                    }} className="text-red-500"><TrashIcon /></button>
                                </div>
                                <input type="text" value={item.question} placeholder="質問" onChange={e => {
                                    const updated = [...faq]; updated[index].question = e.target.value;
                                    handleNestedChange('settings.content.faq', updated);
                                }} className="w-full p-2 border rounded"/>
                                <textarea value={item.answer} placeholder="回答" onChange={e => {
                                    const updated = [...faq]; updated[index].answer = e.target.value;
                                    handleNestedChange('settings.content.faq', updated);
                                }} className="w-full p-2 border rounded" rows={3}/>
                            </div>
                        ))}
                        <button type="button" onClick={() => handleNestedChange('settings.content.faq', [...faq, {id: `faq${Date.now()}`, question: '', answer: ''}])} className="text-primary hover:underline">+ Q&Aを追加</button>
                    </div>}
                </div>

                <div className="p-4 border rounded-md">
                    <label className="flex items-center gap-2 font-semibold">
                        <input type="checkbox" name="settings.content.showHosts" checked={campaign.settings.content.showHosts ?? true} onChange={handleChange} className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary" />
                        <span>開催者情報を表示する</span>
                    </label>
                    {campaign.settings.content.showHosts && <div className="mt-4 pl-6 space-y-4">
                       {hosts.map((host, index) => (
                          <div key={host.id} className="p-4 border rounded-md space-y-2 bg-gray-50 relative">
                              <input type="text" value={host.name} placeholder="開催者名" onChange={e => handleHostChange(index, 'name', e.target.value)} className="w-full p-2 border rounded"/>
                              <input type="text" value={host.url} placeholder="https://example.com" onChange={e => handleHostChange(index, 'url', e.target.value)} className="w-full p-2 border rounded"/>
                              <button onClick={() => handleDeleteHost(index)} className="absolute top-2 right-2 text-red-500 p-1 rounded-full hover:bg-red-100"><TrashIcon className="w-5 h-5"/></button>
                          </div>
                      ))}
                      <button type="button" onClick={handleAddHost} className="text-primary hover:underline">+ 開催者を追加</button>
                    </div>}
                </div>

                <div>
                    <h3 className="text-lg font-semibold">利用規約</h3>
                    <textarea name="settings.content.terms" value={campaign.settings.content.terms} onChange={handleChange} className="w-full p-2 border rounded" rows={5}/>
                </div>
                <div>
                    <h3 className="text-lg font-semibold">プライバシーポリシー</h3>
                    <textarea name="settings.content.privacy" value={campaign.settings.content.privacy} onChange={handleChange} className="w-full p-2 border rounded" rows={5}/>
                </div>
                <div>
                    <h3 className="text-lg font-semibold">フッター設定</h3>
                    <label className="font-medium text-sm mt-2 block">コピーライト</label>
                    <input name="settings.content.footer.copyright" value={footer.copyright} onChange={handleChange} className="w-full p-2 border rounded"/>
                    
                    <div className="mt-4 p-4 border rounded-md">
                        <label className="flex items-center gap-2 font-semibold">
                            <input type="checkbox" name="settings.content.footer.showBanners" checked={campaign.settings.content.footer.showBanners ?? true} onChange={handleChange} className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary" />
                            <span>フッターバナーを表示する</span>
                        </label>
                        {campaign.settings.content.footer.showBanners && <div className="mt-4 pl-6 space-y-2">
                            {footer.bannerLinks.map((banner, index) => (
                                <div key={banner.id} className="p-4 border rounded-md space-y-2 bg-gray-50">
                                    <div className="flex justify-end">
                                        <button onClick={() => {
                                            const updated = footer.bannerLinks.filter((_, i) => i !== index);
                                            handleNestedChange('settings.content.footer.bannerLinks', updated);
                                        }} className="text-red-500"><TrashIcon /></button>
                                    </div>
                                    <input type="text" placeholder="リンク先URL" value={banner.targetUrl} onChange={e => {
                                        const updated = [...footer.bannerLinks]; updated[index].targetUrl = e.target.value;
                                        handleNestedChange('settings.content.footer.bannerLinks', updated);
                                    }} className="w-full p-2 border rounded"/>
                                    <ImageUpload label="バナー画像" currentImageUrl={banner.imageUrl} onImageUploaded={url => {
                                        const updated = [...footer.bannerLinks]; updated[index].imageUrl = url;
                                        handleNestedChange('settings.content.footer.bannerLinks', updated);
                                    }} campaignId={campaign.id} path={`banner-${banner.id}`} />
                                </div>
                            ))}
                             <button type="button" onClick={() => handleNestedChange('settings.content.footer.bannerLinks', [...footer.bannerLinks, {id: `banner${Date.now()}`, imageUrl: '', targetUrl: ''}])} className="text-primary hover:underline mt-2">+ バナーを追加</button>
                        </div>}
                    </div>
                </div>
            </div>
        );
      default:
        return null;
    }
  };
  
  return (
    <>
      <Breadcrumbs items={breadcrumbItems} />
      <div className="bg-white p-4 sm:p-6 lg:p-8 rounded-lg shadow-lg">
        <div className="flex flex-col sm:flex-row justify-between sm:items-center mb-6 gap-2">
          <h1 className="text-2xl lg:text-3xl font-bold text-gray-800 truncate" title={campaign.name || '新規キャンペーン作成'}>{campaign.name || '新規キャンペーン作成'}</h1>
        </div>
        
         {campaignUrl && (
          <div className="mb-6 p-3 bg-gray-100 rounded-md flex items-center gap-4">
              <label className="font-semibold text-sm text-gray-700">キャンペーンURL:</label>
              <input 
                  type="text" 
                  value={campaignUrl} 
                  readOnly 
                  className="flex-grow bg-white border border-gray-300 rounded-md p-2 text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-primary/50" 
              />
              <button
                  onClick={() => navigator.clipboard.writeText(campaignUrl).then(() => alert('URLをコピーしました'))}
                  className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary-hover"
              >
                  <ClipboardIcon className="w-4 h-4" />
                  <span>コピー</span>
              </button>
          </div>
        )}

        <div className="flex flex-col md:flex-row gap-8">
          <aside className="md:w-1/4 lg:w-1/5">
              <nav className="flex flex-col space-y-2">
                   {MENU_ITEMS.map(item => (
                      <button
                          key={item}
                          onClick={() => setActiveMenu(item)}
                          className={`text-left p-2 rounded-md font-medium text-sm ${
                              activeMenu === item ? 'bg-secondary text-primary' : 'text-gray-600 hover:bg-gray-100'
                          }`}
                      >
                          {item}
                      </button>
                  ))}
              </nav>
          </aside>

          <div className="flex-1 md:w-3/4 lg:w-4/5">
            <div>
              {renderMenuContent()}
            </div>
          </div>
        </div>


        <div className="mt-8 pt-6 border-t flex justify-end gap-4">
          <button onClick={() => navigate(`/admin/clients/${campaign.clientId}/campaigns`)} className="px-4 py-2 text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300">キャンセル</button>
          <button onClick={handleSave} disabled={saving} className="px-6 py-2 text-white bg-primary rounded-md hover:bg-primary-hover disabled:bg-gray-400 min-w-[120px] flex items-center justify-center">
              {saving ? <Spinner/> : '保存'}
          </button>
        </div>
      </div>
    </>
  );
};

export default CampaignEditor;
