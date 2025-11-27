
import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
// FIX: Removed v9 'createUserWithEmailAndPassword' import for v8 compatibility.
import { auth } from '../../services/firebase';

const AdminRegister: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    document.title = "管理画面｜管理者登録";
  }, []);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError('パスワードが一致しません。');
      return;
    }
    if (password.length < 6) {
        setError('パスワードは6文字以上で設定してください。');
        return;
    }
    
    setIsLoading(true);
    setError('');

    try {
        // 事前にメールアドレスが登録済みかチェックする
        const methods = await auth.fetchSignInMethodsForEmail(email);
        if (methods.length > 0) {
          setError('このメールアドレスは既に使用されています。');
          setIsLoading(false);
          return;
        }

        // FIX: Used v8 auth.createUserWithEmailAndPassword method.
        await auth.createUserWithEmailAndPassword(email, password);
        navigate('/admin/login', { state: { message: '登録が完了しました。ログインしてください。' } });
    } catch (error: any) {
        console.error("Registration error:", error);
        if (error.code === 'auth/email-already-in-use') {
            setError('このメールアドレスは既に使用されています。');
        } else {
            setError('登録中にエラーが発生しました。');
        }
    } finally {
        setIsLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <div className="w-full max-w-md p-8 space-y-8 bg-white rounded-lg shadow-md">
        <div>
          <h2 className="text-3xl font-extrabold text-center text-gray-900">
            管理者登録
          </h2>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleRegister}>
          <div className="space-y-4 rounded-md shadow-sm">
            <div>
              <label htmlFor="email-address" className="sr-only">メールアドレス</label>
              <input
                id="email-address"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="relative block w-full px-3 py-2 text-gray-900 placeholder-gray-500 border border-gray-300 rounded-t-md appearance-none focus:outline-none focus:ring-primary focus:border-primary focus:z-10 sm:text-sm"
                placeholder="メールアドレス"
              />
            </div>
            <div>
              <label htmlFor="password" className="sr-only">パスワード</label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="relative block w-full px-3 py-2 text-gray-900 placeholder-gray-500 border border-gray-300 appearance-none focus:outline-none focus:ring-primary focus:border-primary focus:z-10 sm:text-sm"
                placeholder="パスワード"
              />
            </div>
             <div>
              <label htmlFor="confirm-password" className="sr-only">パスワード（確認用）</label>
              <input
                id="confirm-password"
                name="confirm-password"
                type="password"
                autoComplete="new-password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="relative block w-full px-3 py-2 text-gray-900 placeholder-gray-500 border border-gray-300 rounded-b-md appearance-none focus:outline-none focus:ring-primary focus:border-primary focus:z-10 sm:text-sm"
                placeholder="パスワード（確認用）"
              />
            </div>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div>
            <button
              type="submit"
              disabled={isLoading}
              className="relative flex justify-center w-full px-4 py-2 text-sm font-medium text-white border border-transparent rounded-md group bg-primary hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:bg-gray-400"
            >
              {isLoading ? '登録中...' : '登録する'}
            </button>
          </div>
        </form>
         <div className="text-sm text-center">
            <p className="text-gray-600">すでにアカウントをお持ちですか？
                <Link to="/admin/login" className="font-medium text-primary hover:text-primary-hover">
                    ログイン
                </Link>
            </p>
        </div>
      </div>
    </div>
  );
};

export default AdminRegister;
