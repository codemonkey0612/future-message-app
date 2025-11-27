import React from 'react';
import { Campaign, Submission } from '../../types';

interface CampaignDashboardProps {
  campaign: Campaign | null;
  participants: Submission[];
}

const CampaignDashboard: React.FC<CampaignDashboardProps> = ({ campaign, participants }) => {

  const customFields = campaign?.settings.form.fields.customFields || [];

  const exportToCSV = () => {
    if (!campaign || participants.length === 0) return;
    let csvContent = "data:text/csv;charset=utf-8,\uFEFF"; // Add BOM for Excel

    const headers = [
      "Submitted At", 
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
        const row = [
            p.submittedAt,
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
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-sky-50 p-6 rounded-lg shadow text-center">
            <p className="text-lg font-medium text-gray-500">総参加者数</p>
            <p className="text-5xl font-bold text-primary">{participants.length}</p>
        </div>
      </div>

      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-gray-700">参加者一覧</h2>
        <button onClick={exportToCSV} disabled={participants.length === 0} className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:bg-gray-400">
            CSVエクスポート
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full bg-white">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">登録日時</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">メールアドレス</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">メッセージ</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">画像</th>
              {customFields.map(field => (
                <th key={field.id} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{field.label}</th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {participants.length > 0 ? participants.map(p => (
              <tr key={p.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(p.submittedAt).toLocaleString()}</td>
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
            )) : (
                <tr>
                    <td colSpan={4 + customFields.length} className="text-center py-10 text-gray-500">まだ参加者はいません。</td>
                </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default CampaignDashboard;