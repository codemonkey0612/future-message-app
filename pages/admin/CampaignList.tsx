import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { getCampaigns, getAllSubmissions, getClients, addClient, updateClient, deleteClient, addCampaign, deleteCampaign } from '../../services/firestoreService';
import { Campaign, Submission, Client } from '../../types';
import PlusIcon from '../../components/icons/PlusIcon';
import Spinner from '../../components/common/Spinner';
import TrashIcon from '../../components/icons/TrashIcon';
import Breadcrumbs from '../../components/common/Breadcrumbs';
import DuplicateIcon from '../../components/icons/DuplicateIcon';


const EditIcon: React.FC<{ className?: string }> = ({ className = "w-5 h-5" }) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
        <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
    </svg>
);


const CampaignList: React.FC = () => {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCopying, setIsCopying] = useState<string | null>(null);
  const [newClientName, setNewClientName] = useState('');
  const [isAddingClient, setIsAddingClient] = useState(false);
  const [error, setError] = useState('');
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);

  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [editingName, setEditingName] = useState('');
  const navigate = useNavigate();
  const { clientId } = useParams<{ clientId?: string }>();

  const fetchData = async () => {
    setLoading(true);
    try {
      const [campaignsData, submissionsData, clientsData] = await Promise.all([
        getCampaigns(),
        getAllSubmissions(),
        getClients(),
      ]);
      setCampaigns(campaignsData);
      setSubmissions(submissionsData);
      setClients(clientsData);
      
      if (clientId) {
        const client = clientsData.find(c => c.id === clientId);
        if (client) {
            setSelectedClient(client);
        } else {
            console.warn(`Client with id ${clientId} not found.`);
            navigate('/admin/clients');
        }
      } else {
        setSelectedClient(null);
      }

    } catch (error) {
      console.error("Error fetching data:", error);
      setError('データの読み込みに失敗しました。');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [clientId, navigate]);

  useEffect(() => {
    if (selectedClient) {
      document.title = `管理画面｜${selectedClient.name}`;
    } else {
      document.title = '管理画面｜クライアント一覧';
    }
  }, [selectedClient]);
  
  const handleAddClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClientName.trim()) {
      alert('クライアント名を入力してください。');
      return;
    }
    setIsAddingClient(true);
    try {
      await addClient({ name: newClientName });
      setNewClientName('');
      await fetchData(); // Refresh the list
    } catch (error) {
      console.error("Error adding client:", error);
      alert('クライアントの追加に失敗しました。');
    } finally {
      setIsAddingClient(false);
    }
  };
  
  const handleEditClient = (client: Client) => {
    setEditingClient(client);
    setEditingName(client.name);
  };

  const handleSaveEdit = async () => {
    if (!editingClient || !editingName.trim()) return;
    try {
        await updateClient(editingClient.id, { name: editingName });
        setEditingClient(null);
        setEditingName('');
        await fetchData();
    } catch (error) {
        console.error("Error updating client:", error);
        alert('クライアント名の更新に失敗しました。');
    }
  };
  
  const handleDeleteClient = async (clientId: string) => {
    if (window.confirm('このクライアントを本当に削除しますか？関連するキャンペーンは削除されません。')) {
        try {
            await deleteClient(clientId);
            await fetchData();
        } catch (error) {
            console.error("Error deleting client:", error);
            alert('クライアントの削除に失敗しました。');
        }
    }
  }

  const handleCopyCampaign = async (campaignId: string) => {
    if (isCopying) return;
    if (!window.confirm('このキャンペーンをコピーしますか？')) return;
    setIsCopying(campaignId);
    try {
        const campaignToCopy = campaigns.find(c => c.id === campaignId);
        if (!campaignToCopy) throw new Error("Campaign not found");

        const { id, ...campaignData } = campaignToCopy;
        const newCampaignData = {
            ...campaignData,
            name: `${campaignData.name}のコピー`,
        };
        await addCampaign(newCampaignData as Omit<Campaign, 'id'>);
        await fetchData();
    } catch (error) {
        console.error("Error copying campaign:", error);
        alert('キャンペーンのコピーに失敗しました。');
    } finally {
        setIsCopying(null);
    }
  };

  const handleDeleteCampaign = async (campaignId: string) => {
    if (window.confirm('このキャンペーンを本当に削除しますか？関連する参加者データもすべて削除されます。この操作は元に戻せません。')) {
        try {
            await deleteCampaign(campaignId);
            await fetchData(); // Refresh the list
        } catch (error) {
            console.error("Error deleting campaign:", error);
            alert('キャンペーンの削除に失敗しました。');
        }
    }
  };
  
  const campaignsByClient = useMemo(() => {
    const grouped: { [key: string]: Campaign[] } = {};
    clients.forEach(client => {
        grouped[client.id] = campaigns.filter(c => c.clientId === client.id);
    });
    return grouped;
  }, [campaigns, clients]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-full">
        <Spinner />
      </div>
    );
  }
  
  // Campaign List View (for a specific client)
  if (selectedClient) {
    const clientCampaigns = campaignsByClient[selectedClient.id] || [];
    const breadcrumbItems = [
        { label: 'クライアント管理', path: '/admin/clients' },
        { label: selectedClient.name }
    ];
    return (
        <>
            <Breadcrumbs items={breadcrumbItems} />
            <div className="bg-white p-6 md:p-8 rounded-lg shadow-lg">
                <div 
                    onClick={() => navigate('/admin/clients')} 
                    className="inline-block text-sm text-primary hover:underline mb-4 cursor-pointer"
                >
                  &larr; クライアント一覧に戻る
                </div>
                <div className="flex flex-col sm:flex-row justify-between sm:items-center mb-6 gap-4">
                    <h2 className="text-2xl font-bold text-gray-800">{selectedClient.name}</h2>
                     <Link
                        to={`/admin/clients/${selectedClient.id}/campaigns/new`}
                        state={{ clientName: selectedClient.name }}
                        className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-primary border border-transparent rounded-md shadow-sm hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary"
                    >
                        <PlusIcon className="w-5 h-5 mr-2" />
                        新規キャンペーン作成
                    </Link>
                </div>
                <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {clientCampaigns.length > 0 ? clientCampaigns.map(campaign => {
                      const now = new Date();
                      const start = new Date(campaign.submissionStart);
                      const end = new Date(campaign.submissionEnd);
                      const status = now < start ? '予定' : (now > end ? '終了' : '公開中');
                      const submissionCount = submissions.filter(s => s.campaignId === campaign.id).length;

                      return (
                          <div key={campaign.id} className="bg-white rounded-lg shadow-md hover:shadow-xl transition-shadow duration-300 flex flex-col border">
                              <div className="p-4 flex-grow cursor-pointer" onClick={() => navigate(`/admin/clients/${selectedClient.id}/campaigns/edit/${campaign.id}`, { state: { clientName: selectedClient.name } })}>
                                  <h3 className="text-lg font-bold text-gray-800 truncate" title={campaign.name}>{campaign.name}</h3>
                                  <p className="text-sm text-gray-500 mt-1">{new Date(campaign.submissionStart).toLocaleDateString()} - {new Date(campaign.submissionEnd).toLocaleDateString()}</p>
                              </div>
                              <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 flex justify-between items-center text-sm">
                                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                      status === '公開中' ? 'bg-green-100 text-green-800' :
                                      status === '終了' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'
                                  }`}>
                                      {status}
                                  </span>
                                  <span className="text-gray-600">
                                    {submissionCount}件
                                  </span>
                                  <div className="flex items-center gap-1">
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleCopyCampaign(campaign.id); }}
                                        className="p-2 text-gray-500 rounded-full hover:bg-gray-100 hover:text-primary disabled:opacity-50"
                                        title="キャンペーンをコピー"
                                        disabled={isCopying !== null}
                                    >
                                        {isCopying === campaign.id ? <Spinner /> : <DuplicateIcon className="w-5 h-5" />}
                                    </button>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleDeleteCampaign(campaign.id); }}
                                        className="p-2 text-gray-500 rounded-full hover:bg-gray-100 hover:text-red-500"
                                        title="キャンペーンを削除"
                                    >
                                        <TrashIcon className="w-5 h-5" />
                                    </button>
                                  </div>
                              </div>
                          </div>
                      );
                  }) : (
                    <div className="col-span-full text-center py-10 text-gray-500">
                      このクライアントにはキャンペーンがありません。
                    </div>
                  )}
                </div>
              </div>
          </>
    )
  }

  // Client List View
  return (
    <>
      <Breadcrumbs items={[{ label: 'クライアント管理' }]} />
      <div className="space-y-8">
        <div className="bg-white p-6 rounded-lg shadow-lg">
          <h2 className="text-xl font-bold text-gray-800 mb-4">新規クライアント追加</h2>
          <form onSubmit={handleAddClient} className="flex items-center gap-4">
            <input 
              type="text" 
              value={newClientName}
              onChange={(e) => setNewClientName(e.target.value)}
              placeholder="クライアント名"
              className="flex-grow p-2 border rounded-md shadow-sm focus:ring-primary focus:border-primary"
              disabled={isAddingClient}
            />
            <button 
              type="submit" 
              disabled={isAddingClient}
              className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-green-600 border border-transparent rounded-md shadow-sm hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:bg-gray-400"
            >
              {isAddingClient ? <Spinner /> : '追加'}
            </button>
          </form>
        </div>
        
        {error && <div className="text-red-500 bg-red-100 p-4 rounded-md">{error}</div>}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {clients.length > 0 ? clients.map(client => (
            <div key={client.id} className="bg-white rounded-lg shadow-lg hover:shadow-xl transition-shadow duration-300 flex flex-col">
              <div className="p-6 cursor-pointer flex-grow" onClick={() => editingClient?.id !== client.id && navigate(`/admin/clients/${client.id}/campaigns`)}>
                {editingClient?.id === client.id ? (
                  <div className="flex items-stretch gap-2">
                    <input
                      type="text"
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      className="flex-grow p-2 border rounded-md"
                      autoFocus
                      onKeyDown={(e) => e.key === 'Enter' && handleSaveEdit()}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <button onClick={handleSaveEdit} className="px-4 text-white bg-green-600 rounded-md hover:bg-green-700">保存</button>
                    <button onClick={() => setEditingClient(null)} className="px-3 text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300">X</button>
                  </div>
                ) : (
                  <h2 className="text-xl font-bold text-gray-800 truncate">{client.name}</h2>
                )}
              </div>
               <div className="px-6 py-3 border-t border-gray-100 flex justify-end items-center gap-2">
                  <button onClick={(e) => { e.stopPropagation(); handleEditClient(client); }} className="p-2 text-gray-500 rounded-full hover:bg-gray-100 hover:text-primary">
                      <EditIcon />
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); handleDeleteClient(client.id); }} className="p-2 text-gray-500 rounded-full hover:bg-gray-100 hover:text-red-500">
                      <TrashIcon />
                  </button>
               </div>
            </div>
          )) : (
              <div className="md:col-span-2 lg:col-span-3 bg-white p-8 rounded-lg shadow-lg text-center text-gray-500">
                  <p>クライアントが登録されていません。最初のクライアントを追加しましょう。</p>
              </div>
          )}
        </div>
      </div>
    </>
  );
};

export default CampaignList;