import React, { useEffect, useState } from 'react';
import { auth } from './firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import Auth from './components/Auth';
import Dashboard from './components/Dashboard';
import GameRoom from './components/GameRoom';
import { ToastContainer } from './components/Toast';

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  if (loading) return <div className="min-h-screen bg-[#0a0908] flex items-center justify-center text-[#c6a779]">Loading...</div>;

  const urlParams = new URLSearchParams(window.location.search);
  const battleId = urlParams.get('battle');

  return (
    <div className="min-h-screen bg-[#0a0908] text-[#f2e9e4] font-sans selection:bg-[#c6a779] selection:text-black">
      <ToastContainer />
      {!user ? (
        <Auth />
      ) : (
        battleId ? <GameRoom battleId={battleId} /> : <Dashboard />
      )}
    </div>
  );
};

export default App;
