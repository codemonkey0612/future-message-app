
import React, { useMemo } from 'react';
import { Campaign, Submission } from '../../types';

interface CampaignDashboardProps {
  campaign: Campaign | null;
  participants: Submission[];
}

const CampaignDashboard: React.FC<CampaignDashboardProps> = ({ campaign, participants }) => {

  const customFields = campaign?.settings.form.fields.customFields || [];

  // 配信予定日とステータスを計算するヘルパー関数
  const getDeliveryInfo = (submission: Submission) => {
    if (!campaign) return { date: null, status: 'unknown', label: '-' };

    let deliveryDate: Date | null = null;

    // PRIORITY 1: Use deliveredAt if available (preferred - shows scheduled delivery time)
    if (submission.deliveredAt) {
      if (typeof submission.deliveredAt === 'string') {
        deliveryDate = new Date(submission.deliveredAt);
      } else if (submission.deliveredAt && typeof submission.deliveredAt === 'object' && 'toDate' in submission.deliveredAt) {
        // Firestore Timestamp
        deliveryDate = (submission.deliveredAt as any).toDate();
      }
    }
    
    // PRIORITY 2: Calculate delivery date based on campaign type (fallback)
    if (!deliveryDate) {
      if (campaign.deliveryType === 'datetime' && campaign.deliveryDateTime) {
        deliveryDate = new Date(campaign.deliveryDateTime);
      } else if (campaign.deliveryType === 'interval' && campaign.deliveryIntervalDays) {
        // Handle submittedAt - could be string, Date, or Firestore Timestamp
        let submitted: Date;
        if (submission.submittedAt instanceof Date) {
          submitted = submission.submittedAt;
        } else if (typeof submission.submittedAt === 'string') {
          submitted = new Date(submission.submittedAt);
        } else if (submission.submittedAt && typeof submission.submittedAt === 'object' && 'toDate' in submission.submittedAt) {
          // Firestore Timestamp
          submitted = (submission.submittedAt as any).toDate();
        } else {
          return { date: null, status: 'unknown', label: '-' };
        }
        deliveryDate = new Date(submitted);
        deliveryDate.setDate(deliveryDate.getDate() + Number(campaign.deliveryIntervalDays));
      } else {
        return { date: null, status: 'unknown', label: '-' };
      }
    }

    // IMPORTANT: Check the delivered field to determine status
    // If delivered === true, status is "配達済み" (delivered)
    // If delivered === false or undefined, status is "配信待ち" (pending)
    const isDelivered = submission.delivered === true;

    return {
        date: deliveryDate,
        status: isDelivered ? 'sent' : 'pending',
        label: isDelivered ? '配達済み' : '配信待ち'
    };
  };

  // アンケート集計ロジック
  const surveyStats = useMemo(() => {
    if (!campaign?.settings.survey.enabled || participants.length === 0) return null;

    const stats: { [questionId: string]: { [option: string]: number } } = {};
    const textResponses: { [questionId: string]: string[] } = {};

    campaign.settings.survey.questions.forEach(q => {
      if (['radio', 'select', 'checkbox'].includes(q.type)) {
        // 選択肢の初期化
        stats[q.id] = {};
        q.options?.forEach(opt => {
          stats[q.id][opt] = 0;
        });
      } else {
        // テキスト入力系の初期化
        textResponses[q.id] = [];
      }
    });

    participants.forEach(p => {
      const answers = p.surveyAnswers;
      Object.keys(answers).forEach(qId => {
        const val = answers[qId];
        if (!val) return;

        // 集計対象の質問かチェック
        if (stats[qId]) {
            if (Array.isArray(val)) {
                // チェックボックスなど複数選択
                val.forEach(v => {
                    if (stats[qId][v] !== undefined) {
                        stats[qId][v]++;
                    } else {
                        // 選択肢が変更された後に古い回答がある場合のハンドリング（一応カウントする）
                        stats[qId][v] = 1;
                    }
                });
            } else {
                // 単一選択
                if (stats[qId][val] !== undefined) {
                    stats[qId][val]++;
                } else {
                    stats[qId][val] = 1;
                }
            }
        } else if (textResponses[qId] !== undefined) {
            // テキスト回答あり
            const strVal = String(val).trim();
            if (strVal !== '') {
                textResponses[qId].push(strVal);
            }
        }
      });
    });

    return { stats, textResponses };
  }, [campaign, participants]);


  const exportToCSV = () => {
    if (!campaign || participants.length === 0) return;
    let csvContent = "data:text/csv;charset=utf-8,\uFEFF"; // Add BOM for Excel

    const headers = [
      "Submitted At", 
      "Delivery Date", // Added
      "Status", // Added
      "Email", 
      "Message", 
      "Image URL",
      ...customFields.map(f => f.label), 
      ...Object.keys(participants[0]?.surveyAnswers || {}).map(qId => {
        const question = campaign.settings.survey.questions.find(q => q.id === qId);
        return question ? question.text : qId;
      })
    ];
    csvContent += headers.map(h => `"${h.replace(/"/g, '""')}"`).join(",") + "\r\n";
    
    participants.forEach(p => {
        const { date, label } = getDeliveryInfo(p);
        const dateStr = date ? date.toLocaleString() : '-';

        const row = [
            p.submittedAt,
            dateStr, // Added
            label, // Added
            p.formData.email || '',
            p.formData.message || '',
            p.formData.imageUrl || '',
            ...customFields.map(field => p.formData[field.id] || ''),
             ...Object.values(p.surveyAnswers).map(ans => Array.isArray(ans) ? ans.join(';') : ans)
        ].map(val => `"${String(val).replace(/"/g, '""')}"`);

        csvContent += row.join(",") + "\r\n";
    });
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `participants_${campaign.id}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-8">
      {/* 概要カード */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-sky-50 p-6 rounded-lg shadow text-center border border-sky-100">
            <p className="text-lg font-medium text-gray-500">総参加者数</p>
            <p className="text-5xl font-bold text-primary">{participants.length}</p>
        </div>
      </div>

      {/* アンケート集計セクション */}
      {surveyStats && campaign?.settings.survey.enabled && (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
            <h2 className="text-xl font-bold text-gray-700 mb-6 pb-2 border-b">アンケート集計</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {campaign.settings.survey.questions.map(q => {
                    const isChoice = ['radio', 'select', 'checkbox'].includes(q.type);
                    const totalResponses = participants.length;

                    if (isChoice && surveyStats.stats[q.id]) {
                        return (
                            <div key={q.id} className="break-inside-avoid">
                                <h3 className="font-semibold text-gray-800 mb-3">{q.text}</h3>
                                <div className="space-y-3">
                                    {Object.entries(surveyStats.stats[q.id]).map(([option, count]) => {
                                        const percentage = totalResponses > 0 ? Math.round(((count as number) / totalResponses) * 100) : 0;
                                        return (
                                            <div key={option}>
                                                <div className="flex justify-between text-sm mb-1">
                                                    <span className="text-gray-700">{option}</span>
                                                    <span className="text-gray-500 font-medium">{count}件 ({percentage}%)</span>
                                                </div>
                                                <div className="w-full bg-gray-200 rounded-full h-2.5">
                                                    <div 
                                                        className="bg-primary h-2.5 rounded-full transition-all duration-500" 
                                                        style={{ width: `${percentage}%` }}
                                                    ></div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    } else {
                        const responses = surveyStats.textResponses[q.id] || [];
                        return (
                            <div key={q.id} className="break-inside-avoid">
                                <h3 className="font-semibold text-gray-800 mb-2">{q.text}</h3>
                                <div className="bg-gray-50 rounded-md border border-gray-100 max-h-60 overflow-y-auto">
                                    {responses.length > 0 ? (
                                        <ul className="divide-y divide-gray-200">
                                            {responses.map((resp, i) => (
                                                <li key={i} className="p-3 text-sm text-gray-700 whitespace-pre-wrap">
                                                    {resp}
                                                </li>
                                            ))}
                                        </ul>
                                    ) : (
                                        <div className="p-4 text-center text-gray-400 text-sm">回答なし</div>
                                    )}
                                </div>
                                <p className="text-right text-xs text-gray-500 mt-1">{responses.length} 件の回答</p>
                            </div>
                        );
                    }
                })}
            </div>
        </div>
      )}

      {/* 参加者一覧テーブル */}
      <div className="space-y-4">
        <div className="flex justify-between items-center">
            <h2 className="text-xl font-bold text-gray-700">参加者一覧</h2>
            <button onClick={exportToCSV} disabled={participants.length === 0} className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:bg-gray-400">
                CSVエクスポート
            </button>
        </div>

        <div className="overflow-x-auto bg-white rounded-lg shadow border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
                <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">登録日時</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">配信予定日</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ステータス</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">メールアドレス</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">メッセージ</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">画像</th>
                {customFields.map(field => (
                    <th key={field.id} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{field.label}</th>
                ))}
                </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
                {participants.length > 0 ? participants.map(p => {
                  const { date, status, label } = getDeliveryInfo(p);
                  // Handle submittedAt - could be string, Date, or Firestore Timestamp
                  let submittedAtDate: Date;
                  if (p.submittedAt instanceof Date) {
                    submittedAtDate = p.submittedAt;
                  } else if (typeof p.submittedAt === 'string') {
                    submittedAtDate = new Date(p.submittedAt);
                  } else if (p.submittedAt && typeof p.submittedAt === 'object' && 'toDate' in p.submittedAt) {
                    // Firestore Timestamp
                    submittedAtDate = (p.submittedAt as any).toDate();
                  } else {
                    submittedAtDate = new Date();
                  }
                  
                  return (
                    <tr key={p.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {isNaN(submittedAtDate.getTime()) ? '-' : submittedAtDate.toLocaleString('ja-JP')}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {date ? date.toLocaleString() : '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                status === 'sent' ? 'bg-gray-100 text-gray-800' : 'bg-blue-100 text-blue-800'
                            }`}>
                                {label}
                            </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{p.formData.email}</td>
                        <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate" title={p.formData.message}>{p.formData.message}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {p.formData.imageUrl && (
                            <a href={p.formData.imageUrl} target="_blank" rel="noopener noreferrer">
                            <img src={p.formData.imageUrl} alt="アップロード画像" className="h-10 w-10 object-cover rounded" />
                            </a>
                        )}
                        </td>
                        {customFields.map(field => (
                        <td key={field.id} className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{p.formData[field.id] || ''}</td>
                        ))}
                    </tr>
                )}) : (
                    <tr>
                        <td colSpan={6 + customFields.length} className="text-center py-10 text-gray-500">まだ参加者はいません。</td>
                    </tr>
                )}
            </tbody>
            </table>
        </div>
      </div>
    </div>
  );
};

export default CampaignDashboard;
