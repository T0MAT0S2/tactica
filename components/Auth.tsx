import React, { useState } from 'react';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signInAnonymously } from 'firebase/auth';
import { auth, getAppId } from '../firebase';
import { showToast } from './Toast';

const Auth: React.FC = () => {
  const [view, setView] = useState<'login' | 'signup' | 'join'>('login');
  const [identifier, setIdentifier] = useState(''); // Email or Username
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [inviteLink, setInviteLink] = useState('');
  const [error, setError] = useState('');

  const getEmail = (input: string) => {
      // If input looks like an email, use it. Otherwise, append a dummy domain.
      return input.includes('@') ? input : `${input}@tactica.local`;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await signInWithEmailAndPassword(auth, getEmail(identifier), password);
    } catch (err) {
      setError('로그인 정보가 올바르지 않습니다.');
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) { setError('비밀번호가 일치하지 않습니다.'); return; }
    if (password.length < 6) { setError('비밀번호는 6자 이상이어야 합니다.'); return; }
    try {
      await createUserWithEmailAndPassword(auth, getEmail(identifier), password);
    } catch (err: any) {
      if (err.code === 'auth/email-already-in-use') setError('이미 사용 중인 아이디/이메일입니다.');
      else setError('회원가입 실패.');
    }
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (!inviteLink) { setError('링크를 입력하세요.'); return; }
      const url = new URL(inviteLink);
      const battleId = url.searchParams.get('battle');
      const appId = url.searchParams.get('app');
      
      if (battleId && appId) {
        await signInAnonymously(auth);
        window.location.href = `?app=${appId}&battle=${battleId}`;
      } else {
        setError('유효하지 않은 링크입니다.');
      }
    } catch (err) {
      setError('유효하지 않은 링크 형식이거나 오류가 발생했습니다.');
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center p-4 backdrop-blur-sm z-50">
       <div className="bg-[#1e1b18] border border-[#4a3f35] p-6 rounded-lg shadow-2xl w-full max-w-sm relative">
         {error && <div className="text-red-400 text-center text-sm absolute -top-8 left-0 right-0">{error}</div>}
         
         {view === 'join' ? (
           <>
             <h3 className="text-center font-bold text-[#a99985] mb-2">PLAYER</h3>
             <form onSubmit={handleJoin} className="space-y-2">
               <input type="text" placeholder="초대 링크 붙여넣기" value={inviteLink} onChange={e => setInviteLink(e.target.value)} className="w-full bg-[#141210] border border-[#4a3f35] p-3 rounded outline-none text-[#f2e9e4] focus:border-[#c6a779]" />
               <button type="submit" className="w-full bg-[#3d352e] text-[#f2e9e4] border border-[#5a4d41] py-2 rounded font-bold hover:bg-[#4a3f35]">참가</button>
             </form>
             <button onClick={() => setView('login')} className="w-full mt-2 text-sm text-[#a99985] hover:text-[#f2e9e4]">GM 로그인으로 돌아가기</button>
           </>
         ) : (
           <>
             <h3 className="text-center font-bold text-[#c6a779] mb-2">SYSTEM</h3>
             <form onSubmit={view === 'login' ? handleLogin : handleSignup} className="space-y-2">
               <input type="text" placeholder="아이디 또는 이메일" value={identifier} onChange={e => setIdentifier(e.target.value)} className="w-full bg-[#141210] border border-[#4a3f35] p-3 rounded outline-none text-[#f2e9e4] focus:border-[#c6a779]" required />
               <input type="password" placeholder="비밀번호" value={password} onChange={e => setPassword(e.target.value)} className="w-full bg-[#141210] border border-[#4a3f35] p-3 rounded outline-none text-[#f2e9e4] focus:border-[#c6a779]" required />
               {view === 'signup' && (
                 <input type="password" placeholder="비밀번호 확인" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className="w-full bg-[#141210] border border-[#4a3f35] p-3 rounded outline-none text-[#f2e9e4] focus:border-[#c6a779]" required />
               )}
               <div className="flex gap-2">
                 <button type="submit" className="w-full bg-[#c6a779] text-[#0a0908] border border-[#e0c598] py-2 rounded font-bold hover:bg-[#d6b88a]">{view === 'login' ? '로그인' : '가입'}</button>
                 <button type="button" onClick={() => { setView(view === 'login' ? 'signup' : 'login'); setError(''); }} className="w-full bg-[#3d352e] text-[#f2e9e4] border border-[#5a4d41] py-2 rounded font-bold hover:bg-[#4a3f35]">{view === 'login' ? '회원가입' : '취소'}</button>
               </div>
             </form>
             <div className="my-4 flex items-center gap-2">
                <hr className="flex-grow border-gray-700" />
                <span className="text-[#a99985] font-bold text-xs">OR</span>
                <hr className="flex-grow border-gray-700" />
            </div>
             <button onClick={() => setView('join')} className="w-full bg-[#3d352e] text-[#f2e9e4] border border-[#5a4d41] py-2 rounded font-bold hover:bg-[#4a3f35]">초대 코드로 참가</button>
           </>
         )}
       </div>
    </div>
  );
};

export default Auth;