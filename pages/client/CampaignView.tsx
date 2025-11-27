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

  useEffect(() => {
    if (campaign) {
      document.title = campaign.name;
    }
  }, [campaign]);

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
      backgroundImage: design.backgroundImageUrl ? `url(${design.backgroundImageUrl})` : 'none',
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundAttachment: 'fixed',
      '--theme-color': design.themeColor
  } as React.CSSProperties;

  return (
    <div style={pageStyle} className="min-h-screen font-sans p-0 sm:p-4 md:p-8 flex items-start justify-center">
      <div className="w-full max-w-md mx-auto bg-white shadow-2xl overflow-hidden sm:rounded-2xl min-h-screen sm:min-h-0">
        <header>
          {design.mainVisualUrl ? (
            <img src={design.mainVisualUrl} alt={campaign.name} className="w-full h-auto block" />
          ) : (design.showTitle ?? true) ? (
            <div className="w-full h-48 flex items-center justify-center p-4" style={{ backgroundColor: design.themeColor }}>
              <h1 className="text-2xl font-extrabold text-white text-center break-words">{campaign.name}</h1>
            </div>
          ) : null}
        </header>

        <main className="p-6 md:p-8">
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
            { content.showHowTo && ((content.howTo.type === 'steps' && content.howTo.steps.length > 0) || (content.howTo.type === 'free' && content.howTo.freeText.text)) ? (
            <div>
              <h3 className="text-2xl font-bold text-gray-800 mb-4 border-b-2 pb-2 text-center" style={{borderColor: design.themeColor}}>参加方法</h3>
              {content.howTo.type === 'steps' ? (
                <div className="space-y-6 mt-4">
                  {content.howTo.steps.map((step, index) => (
                    <div key={step.id} className="flex items-start gap-4 md:gap-6">
                      <div className="flex-shrink-0 font-medium text-3xl w-12 text-center pt-1" style={{color: design.themeColor}}>
                        {index + 1}
                      </div>
                      <div className="flex-1">
                        <h4 className="font-bold text-lg text-gray-800">{step.title}</h4>
                        <p className="text-gray-600 whitespace-pre-wrap mt-1">{step.text}</p>
                        {step.imageUrl && <img src={step.imageUrl} alt={step.title} className="mt-2 rounded-lg max-w-full h-auto shadow-sm" />}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-4 prose max-w-none">
                  <p className="text-gray-600 whitespace-pre-wrap">{content.howTo.freeText.text}</p>
                  {content.howTo.freeText.imageUrl && <img src={content.howTo.freeText.imageUrl} alt="参加方法" className="mt-2 rounded-lg max-w-full h-auto shadow-sm" />}
                </div>
              )}
            </div>
            ) : null }
            
            {content.showFaq && content.faq && content.faq.length > 0 && (
            <>
              <hr/>
              <div>
                <h3 className="text-2xl font-bold text-gray-800 mb-4 border-b-2 pb-2 text-center" style={{borderColor: design.themeColor}}>よくある質問</h3>
                <div className="space-y-2 mt-4">
                  {content.faq.map(item => (
                    <details key={item.id} className="border-b group last:border-b-0">
                      <summary className="font-semibold cursor-pointer py-3 flex justify-between items-center text-gray-800 hover:text-[color:var(--theme-color)]">
                        {item.question}
                        <svg className="w-5 h-5 transform transition-transform duration-200 group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </summary>
                      <div className="p-4 bg-gray-50 text-gray-600 whitespace-pre-wrap rounded-b-md">
                        {item.answer}
                      </div>
                    </details>
                  ))}
                </div>
              </div>
            </>)}
            
            {content.showHosts && content.hosts && content.hosts.length > 0 && (
            <>
                <hr/>
                <div>
                    <h3 className="text-xl font-bold text-gray-800 mb-4 border-b-2 pb-2 text-center" style={{borderColor: design.themeColor}}>開催者情報</h3>
                    <ul className="list-none space-y-2 mt-4 text-center">
                    {content.hosts.map(host => (
                        <li key={host.id}>
                            {host.url ? (
                                <a href={host.url} target="_blank" rel="noopener noreferrer" className="text-[color:var(--theme-color)] hover:underline">{host.name}</a>
                            ) : (
                                <span>{host.name}</span>
                            )}
                        </li>
                    ))}
                    </ul>
                </div>
            </>)}

             {content.footer.showBanners && content.footer.bannerLinks && content.footer.bannerLinks.length > 0 && (
                <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
                    {content.footer.bannerLinks.map(banner => (
                    <a key={banner.id} href={banner.targetUrl} target="_blank" rel="noopener noreferrer">
                        <img src={banner.imageUrl} alt="Banner" className="w-full rounded-lg shadow-md hover:opacity-90 transition-opacity" />
                    </a>
                    ))}
                </div>
            )}
          </div>
        </main>
        
        <footer className="bg-gray-800 text-white py-6">
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
    </div>
  );
};

export default CampaignView;