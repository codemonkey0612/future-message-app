import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Campaign } from '../../types';
import { getCampaign } from '../../services/firestoreService';
import MessageForm from './MessageForm';
import Spinner from '../../components/common/Spinner';

const CampaignView: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCampaign = async () => {
      if (id) {
        try {
          const campaignData = await getCampaign(id);
          setCampaign(campaignData);
        } catch (error) {
          console.error("Error fetching campaign:", error);
        } finally {
          setLoading(false);
        }
      } else {
        setLoading(false);
      }
    };
    fetchCampaign();
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Spinner />
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
        <h1 className="text-4xl font-bold text-gray-800 mb-4">キャンペーンが見つかりません</h1>
        <p className="text-gray-600 mb-8">お探しのキャンペーンは存在しません。</p>
        <Link to="/" className="text-primary hover:underline">トップページに戻る</Link>
      </div>
    );
  }

  const { design, content } = campaign.settings;
  const isSubmissionActive = new Date() >= new Date(campaign.submissionStart) && new Date() <= new Date(campaign.submissionEnd);
  
  const pageStyle = {
      backgroundColor: design.backgroundColor,
      '--theme-color': design.themeColor
  } as React.CSSProperties;

  return (
    <div style={pageStyle} className="min-h-screen font-sans">
      <header className="relative">
        <img src={design.mainVisualUrl} alt={campaign.name} className="w-full h-64 md:h-80 object-cover" />
        <div className="absolute inset-0 bg-black bg-opacity-40 flex items-center justify-center">
          <h1 className="text-3xl md:text-5xl font-extrabold text-white text-center drop-shadow-lg p-4">{campaign.name}</h1>
        </div>
      </header>

      <main className="container mx-auto p-4 md:p-8 max-w-4xl">
        <div className="bg-white rounded-lg shadow-xl p-6 md:p-10">
          <p className="text-lg text-gray-700 mb-8 text-center">{campaign.description}</p>
          
          {isSubmissionActive ? (
            <MessageForm campaign={campaign} />
          ) : (
            <div className="text-center p-8 border-2 border-dashed border-amber-400 rounded-lg bg-amber-50">
              <h2 className="text-2xl font-bold text-amber-700">メッセージの受付は現在終了しています。</h2>
              <p className="text-amber-600 mt-2">
                {new Date(campaign.submissionStart).toLocaleString()}から{new Date(campaign.submissionEnd).toLocaleString()}の間に再度ご確認ください。
              </p>
            </div>
          )}

          <div className="mt-12 space-y-8">
            <div dangerouslySetInnerHTML={{ __html: content.howTo }} />
            <hr/>
            <div dangerouslySetInnerHTML={{ __html: content.faq }} />
            <hr/>
            <div>
                <h3 className="text-xl font-semibold mb-2">主催者</h3>
                <p>{content.organizer}</p>
            </div>
          </div>
        </div>
      </main>

      <footer className="bg-gray-800 text-white mt-12 py-6">
        <div className="container mx-auto px-4 text-center">
            <div className="flex justify-center space-x-4 mb-4">
                {content.footer.textLinks.map((link, i) => (
                    <a key={i} href={link.url} className="hover:text-primary">{link.text}</a>
                ))}
            </div>
            <p className="text-gray-400">{content.footer.copyright}</p>
        </div>
      </footer>
    </div>
  );
};

export default CampaignView;