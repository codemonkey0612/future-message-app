import React, { useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAppContext } from '../../hooks/useAppContext';
// FIX: Removed unused v9 'signOut' import for v8 compatibility.
import { auth } from '../../services/firebase';
import Spinner from '../../components/common/Spinner';

const AdminLayout: React.FC = () => {
  const { state } = useAppContext();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // Wait until the initial auth check is complete before redirecting.
    if (!state.isLoading && !state.isAuthenticated) {
      navigate('/admin/login', { state: { from: location } });
    }
  }, [state.isLoading, state.isAuthenticated, navigate, location]);

  const handleLogout = async () => {
    try {
      // FIX: Used v8 auth.signOut method.
      await auth.signOut();
      // The onAuthStateChanged listener in AppContext will handle state updates,
      // and the useEffect above will handle redirection.
    } catch (error) {
      console.error("Error signing out: ", error);
      alert("ログアウト中にエラーが発生しました。");
    }
  };

  // Display a loading spinner while Firebase is checking auth state
  if (state.isLoading) {
    return (
        <div className="flex h-screen items-center justify-center">
            <Spinner />
        </div>
    );
  }

  // After loading, if not authenticated, the useEffect will trigger a redirect.
  // Render nothing while redirecting to avoid flashing the admin layout.
  if (!state.isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white shadow-md">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <span className="text-xl font-semibold text-gray-800">管理パネル</span>
            </div>
            <div className="flex items-center">
              <button
                onClick={handleLogout}
                className="text-sm font-medium text-gray-600 hover:text-primary"
              >
                ログアウト
              </button>
            </div>
          </div>
        </div>
      </header>
      <main className="container mx-auto p-4 sm:p-6 lg:p-8">
        <Outlet />
      </main>
    </div>
  );
};

export default AdminLayout;