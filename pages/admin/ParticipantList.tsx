import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getCampaign, getSubmissionsForCampaign } from '../../services/firestoreService';
import { Campaign, Submission } from '../../types';
import Spinner from '../../components/common/Spinner';

const ParticipantList: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [participants, setParticipants] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      if (id) {
        try {
          const [campaignData, participantsData] = await Promise.all([
            getCampaign(id),
            getSubmissionsForCampaign(id),
          ]);
          setCampaign(campaignData);
          setParticipants(participantsData);
        } catch (error) {
          console.error("Error fetching participant data:", error);
        } finally {
          setLoading(false);
        }
      }
    };
    fetchData();
  }, [id]);

  if (loading) {
      return <div className="flex justify-center items-center h-full"><Spinner /></div>;
  }

  if (!campaign) {
    return <div>Campaign not found.</div>;
  }

  const exportToCSV = () => {
    if (participants.length === 0) return;
    let csvContent = "data:text/csv;charset=utf-8,";
    // Add headers
    const headers = ["Submitted At", "Email", "Message", ...Object.keys(participants[0]?.surveyAnswers || {})];
    csvContent += headers.join(",") + "\r\n";
    // Add rows
    participants.forEach(p => {
        const row = [
            p.submittedAt,
            p.formData.email,
            `"${p.formData.message?.replace(/"/g, '""') || ''}"`,
             ...Object.values(p.surveyAnswers).map(ans => `"${String(ans).replace(/"/g, '""')}"`)
        ].join(",");
        csvContent += row + "\r\n";
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
    <div className="bg-white p-8 rounded-lg shadow-lg">
      <div className="mb-6">
        <Link to="/admin/clients" className="text-sm text-primary hover:underline">
          &larr; クライアント一覧に戻る
        </Link>
        <h1 className="text-3xl font-bold text-gray-800 mt-2">{campaign.name} - ダッシュボード</h1>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-sky-50 p-6 rounded-lg shadow text-center">
            <p className="text-lg font-medium text-gray-500">総参加者数</p>
            <p className="text-5xl font-bold text-primary">{participants.length}</p>
        </div>
      </div>

      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold text-gray-700">参加者一覧</h2>
        <button onClick={exportToCSV} disabled={participants.length === 0} className="px-4 py-2 text-white bg-green-600 rounded-md hover:bg-green-700 disabled:bg-gray-400">
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
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">アクション</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {participants.length > 0 ? participants.map(p => (
              <tr key={p.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(p.submittedAt).toLocaleString()}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{p.formData.email}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 max-w-sm truncate">{p.formData.message}</td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <button className="text-primary hover:text-primary-hover" onClick={() => alert(JSON.stringify(p, null, 2))}>詳細表示</button>
                </td>
              </tr>
            )) : (
                <tr>
                    <td colSpan={4} className="text-center py-10 text-gray-500">まだ参加者はいません。</td>
                </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ParticipantList;
