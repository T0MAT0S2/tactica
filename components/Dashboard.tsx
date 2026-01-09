import React, { useEffect, useState } from 'react';
import { collection, query, where, getDocs, addDoc, serverTimestamp, deleteDoc, doc, updateDoc, writeBatch } from 'firebase/firestore';
import { db, auth, getAppId } from '../firebase';
import { GameState } from '../types';
import { showToast } from './Toast';

const Dashboard: React.FC = () => {
  const [games, setGames] = useState<GameState[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newGameTitle, setNewGameTitle] = useState('');
  const appId = getAppId();

  const fetchGames = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, `artifacts/${appId}/public/data/battles`), where("gmId", "==", auth.currentUser?.uid));
      const snapshot = await getDocs(q);
      const fetchedGames = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as GameState));
      fetchedGames.sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));
      setGames(fetchedGames);
    } catch (e) {
      showToast("게임 목록을 불러오지 못했습니다.", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGames();
  }, []);

  const getDefaultConfig = () => ({
    statPoints: { min: 12, max: 18 },
    maxTurns: 10,
    maxStatValue: 5,
    bgmUrl: '',
    stats: [
        { id: 'attack', name: '공격', effect: 'baseAttack' },
        { id: 'defense', name: '방어', effect: 'baseDefense' },
        { id: 'agility', name: '민첩', effect: 'movement' },
        { id: 'vitality', name: '체력', effect: 'maxHp' },
        { id: 'luck', name: '행운', effect: 'critChance' }
    ]
  });

  const handleCreateGame = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGameTitle.trim()) return;
    try {
      const battleRef = await addDoc(collection(db, `artifacts/${appId}/public/data/battles`), {
        gmId: auth.currentUser?.uid,
        gameTitle: newGameTitle,
        gameState: 'SETUP',
        teamAName: "Team A",
        teamBName: "Team B",
        createdAt: serverTimestamp(),
        currentTurnCharacterId: null, turnOrder: [], winner: null, turnCount: 1,
        turnActions: { hasMoved: false, hasActed: false }, dialogue: null,
        config: getDefaultConfig()
      });
      window.location.href = `?app=${appId}&battle=${battleRef.id}`;
    } catch (e) {
      showToast("게임 생성 실패", "error");
    }
  };

  const handleDeleteGame = async (gameId: string) => {
    if (!window.confirm("정말로 이 게임과 모든 데이터를 삭제하시겠습니까?")) return;
    try {
        const collections = ['characters', 'logs', 'chats', 'history'];
        const batch = writeBatch(db);
        for (const coll of collections) {
            const snap = await getDocs(collection(db, `artifacts/${appId}/public/data/battles/${gameId}/${coll}`));
            snap.docs.forEach(d => batch.delete(d.ref));
        }
        batch.delete(doc(db, `artifacts/${appId}/public/data/battles`, gameId));
        await batch.commit();
        setGames(prev => prev.filter(g => g.id !== gameId));
        showToast("게임이 삭제되었습니다.", "success");
    } catch (e) {
        showToast("삭제 중 오류 발생", "error");
    }
  };

  const handleUpdateTitle = async (gameId: string, title: string) => {
      if(!title.trim()) return;
      await updateDoc(doc(db, `artifacts/${appId}/public/data/battles`, gameId), { gameTitle: title });
      showToast("제목 저장 완료", "success");
  };

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-8">
      <header className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-[#c6a779] font-serif">내 게임 목록</h1>
        <button onClick={() => setShowCreateModal(true)} className="bg-[#c6a779] text-[#0a0908] px-4 py-2 rounded font-bold border border-[#e0c598] hover:bg-[#d6b88a]">새 게임 생성</button>
      </header>

      <div className="space-y-4">
        {loading ? <p className="text-[#a99985]">불러오는 중...</p> : games.length === 0 ? <p className="text-[#a99985]">생성된 게임이 없습니다.</p> : 
          games.map(game => (
            <div key={game.id} className="bg-[#141210] border border-[#2a2522] p-4 rounded-lg flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="flex-grow w-full">
                <input 
                    type="text" 
                    defaultValue={game.gameTitle} 
                    onBlur={(e) => handleUpdateTitle(game.id!, e.target.value)}
                    className="bg-transparent text-lg font-bold text-[#f2e9e4] w-full focus:outline-none focus:bg-[#1e1b18] rounded px-2 -mx-2"
                />
                <p className="text-sm text-[#a99985] mt-1">ID: {game.id}</p>
              </div>
              <div className="flex items-center gap-2 w-full md:w-auto">
                <a href={`?app=${appId}&battle=${game.id}`} className="bg-[#c6a779] text-[#0a0908] px-3 py-1 text-sm rounded font-bold hover:bg-[#d6b88a] flex-1 md:flex-none text-center">입장</a>
                <button onClick={() => handleDeleteGame(game.id!)} className="bg-[#a13d3d] text-white px-3 py-1 text-sm rounded font-bold hover:bg-[#b84a4a] border border-[#c45c5c] flex-1 md:flex-none">삭제</button>
              </div>
            </div>
          ))
        }
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 backdrop-blur-sm z-50">
            <div className="bg-[#1e1b18] border border-[#4a3f35] p-6 rounded-lg w-full max-w-sm">
                <h2 className="text-2xl font-semibold mb-6 text-[#c6a779]">새 게임 생성</h2>
                <form onSubmit={handleCreateGame} className="space-y-4">
                    <input autoFocus type="text" placeholder="게임 제목" value={newGameTitle} onChange={e => setNewGameTitle(e.target.value)} className="w-full bg-[#141210] border border-[#4a3f35] p-3 rounded outline-none text-[#f2e9e4] focus:border-[#c6a779]" required />
                    <div className="flex justify-end gap-4 pt-4">
                        <button type="button" onClick={() => setShowCreateModal(false)} className="bg-[#3d352e] text-[#f2e9e4] border border-[#5a4d41] px-4 py-2 rounded font-bold hover:bg-[#4a3f35]">취소</button>
                        <button type="submit" className="bg-[#c6a779] text-[#0a0908] border border-[#e0c598] px-4 py-2 rounded font-bold hover:bg-[#d6b88a]">생성</button>
                    </div>
                </form>
            </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
