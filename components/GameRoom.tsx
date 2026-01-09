import React, { useEffect, useState, useRef } from 'react';
import { doc, onSnapshot, collection, query, orderBy, getDocs, updateDoc, writeBatch, serverTimestamp, runTransaction, addDoc, increment, deleteDoc } from 'firebase/firestore';
import { db, auth, getAppId } from '../firebase';
import { GameState, Character, ChatMessage, LogEntry, HistoryEntry } from '../types';
import { showToast } from './Toast';
import BattleGrid from './BattleGrid';
import { CharacterModal, SettingsModal, HistoryModal } from './Modals';
import BGMPlayer from './BGMPlayer';
import { getReachableCells, getTargetCells, getHealableCells, rollD6, getStatIdForEffect } from '../gameLogic';

interface GameRoomProps {
  battleId: string;
}

const GameRoom: React.FC<GameRoomProps> = ({ battleId }) => {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [chats, setChats] = useState<ChatMessage[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  
  // UI State
  const [activeTab, setActiveTab] = useState<'log' | 'stats'>('log');
  const [activeChatTab, setActiveChatTab] = useState<'a' | 'b'>('a');
  const [showCreateChar, setShowCreateChar] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [editCharId, setEditCharId] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState('');
  
  // Gameplay State
  const [placingCharId, setPlacingCharId] = useState<string | null>(null);
  const [turnAction, setTurnAction] = useState<'move' | 'attack' | 'bandage' | null>(null);
  const [dialogueInput, setDialogueInput] = useState('');
  const [timeLeft, setTimeLeft] = useState(60);
  const [actionPanelPos, setActionPanelPos] = useState({ x: 50, y: 50 }); // % based
  const [isDragging, setIsDragging] = useState(false);
  
  const userId = auth.currentUser?.uid;
  const appId = getAppId();
  const logContainerRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // --- Subscriptions ---
  useEffect(() => {
    const unsubBattle = onSnapshot(doc(db, `artifacts/${appId}/public/data/battles/${battleId}`), (d) => {
        if (d.exists()) setGameState({ id: d.id, ...d.data() } as GameState);
    });
    const unsubChars = onSnapshot(query(collection(db, `artifacts/${appId}/public/data/battles/${battleId}/characters`), orderBy("createdAt")), (s) => {
        setCharacters(s.docs.map(d => ({ id: d.id, ...d.data() } as Character)));
    });
    const unsubLogs = onSnapshot(query(collection(db, `artifacts/${appId}/public/data/battles/${battleId}/logs`), orderBy("timestamp")), (s) => {
        setLogs(s.docs.map(d => ({ id: d.id, ...d.data() } as LogEntry)));
    });
    const unsubChats = onSnapshot(query(collection(db, `artifacts/${appId}/public/data/battles/${battleId}/chats`), orderBy("timestamp")), (s) => {
        const newChats = s.docs.map(d => ({ id: d.id, ...d.data() } as ChatMessage));
        setChats(newChats);
        // Beep logic could go here
    });
    
    // Auto scroll
    if (logContainerRef.current) logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    if (chatContainerRef.current) chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;

    return () => { unsubBattle(); unsubChars(); unsubLogs(); unsubChats(); };
  }, [battleId, appId]);

  useEffect(() => {
    if(logContainerRef.current) logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
  }, [logs]);

  useEffect(() => {
    if(chatContainerRef.current) chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
  }, [chats, activeChatTab]);

  useEffect(() => {
      // Load history when modal opens
      if (showHistory) {
        getDocs(query(collection(db, `artifacts/${appId}/public/data/battles/${battleId}/history`), orderBy("timestamp", "desc")))
            .then(s => setHistory(s.docs.map(d => ({id: d.id, ...d.data()} as HistoryEntry))));
      }
  }, [showHistory, appId, battleId]);

  // --- Timer ---
  useEffect(() => {
      if (gameState?.gameState !== 'IN_PROGRESS') return;
      const timer = setInterval(() => {
          setTimeLeft(prev => {
              if (prev <= 1 && (userId === gameState.gmId || userId === characters.find(c => c.id === gameState.currentTurnCharacterId)?.ownerId)) {
                  handleEndTurn();
                  return 60;
              }
              return prev - 1;
          });
      }, 1000);
      return () => clearInterval(timer);
  }, [gameState?.gameState, gameState?.currentTurnCharacterId, userId]);

  useEffect(() => setTimeLeft(60), [gameState?.currentTurnCharacterId]);

  // --- Helpers ---
  const isGM = userId === gameState?.gmId;
  const myChar = characters.find(c => c.ownerId === userId);
  const myTeam = myChar?.team;
  const currentTurnChar = characters.find(c => c.id === gameState?.currentTurnCharacterId);
  const isMyTurn = currentTurnChar?.ownerId === userId || (isGM && !currentTurnChar?.ownerId);

  // --- Actions ---
  const handleAddLog = async (html: string) => {
      await addDoc(collection(db, `artifacts/${appId}/public/data/battles/${battleId}/logs`), { html, timestamp: serverTimestamp() });
  };

  const handleCreateChar = async (data: any) => {
      const config = gameState!.config;
      const hpId = getStatIdForEffect(config, 'maxHp', 'vitality');
      const maxHp = 100 + (data[hpId] || 0) * 20;
      await addDoc(collection(db, `artifacts/${appId}/public/data/battles/${battleId}/characters`), {
          ...data, hp: maxHp, maxHp, x: -1, y: -1, ownerId: null, team: null, createdAt: serverTimestamp(), bandages: 1, stats: { damageDealt: 0, damageTaken: 0, healingDone: 0 }
      });
      setShowCreateChar(false);
  };

  const handleUpdateChar = async (data: any) => {
      if (!editCharId) return;
      const char = characters.find(c => c.id === editCharId)!;
      const config = gameState!.config;
      const hpId = getStatIdForEffect(config, 'maxHp', 'vitality');
      const maxHp = 100 + (data[hpId] || 0) * 20;
      const hp = Math.round(maxHp * (char.hp / char.maxHp));
      await updateDoc(doc(db, `artifacts/${appId}/public/data/battles/${battleId}/characters`, editCharId), { ...data, maxHp, hp });
      setEditCharId(null);
  };

  const deleteCharacter = async (id: string) => {
      if (window.confirm("삭제하시겠습니까?")) await deleteDoc(doc(db, `artifacts/${appId}/public/data/battles/${battleId}/characters`, id));
  };

  const joinTeam = async (id: string, team: string | null) => {
      await updateDoc(doc(db, `artifacts/${appId}/public/data/battles/${battleId}/characters`, id), { team });
  };

  const updateOwner = async (id: string, newOwner: string | null) => {
      await updateDoc(doc(db, `artifacts/${appId}/public/data/battles/${battleId}/characters`, id), { ownerId: newOwner, team: newOwner ? characters.find(c => c.id === id)?.team : null });
  };

  const startBattle = async () => {
      const participants = characters.filter(c => c.team && c.x >= 0);
      if (participants.length === 0) { showToast("배치된 캐릭터가 없습니다.", "error"); return; }
      const moveId = getStatIdForEffect(gameState!.config, 'movement', 'agility');
      participants.sort((a, b) => (b[moveId] || 0) - (a[moveId] || 0));
      await updateDoc(doc(db, `artifacts/${appId}/public/data/battles/${battleId}`), {
          gameState: 'IN_PROGRESS', turnOrder: participants.map(c => c.id), currentTurnCharacterId: participants[0].id,
          turnActions: { hasMoved: false, hasActed: false }, dialogue: null
      });
      handleAddLog(`<p class="text-[#c6a779] font-bold text-center">전투 시작!</p>`);
  };

  const resetBattle = async () => {
      const batch = writeBatch(db);
      batch.update(doc(db, `artifacts/${appId}/public/data/battles/${battleId}`), {
          gameState: 'SETUP', turnOrder: [], currentTurnCharacterId: null, winner: null, turnCount: 1, turnActions: { hasMoved: false, hasActed: false }, dialogue: null
      });
      characters.forEach(c => batch.update(doc(db, `artifacts/${appId}/public/data/battles/${battleId}/characters`, c.id), { x: -1, y: -1, stats: { damageDealt: 0, damageTaken: 0, healingDone: 0 }, bandages: 1 }));
      const logsSnap = await getDocs(collection(db, `artifacts/${appId}/public/data/battles/${battleId}/logs`));
      logsSnap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
  };

  const sendChat = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!chatInput.trim()) return;
      const senderName = myChar?.name || "SYSTEM";
      const senderColor = myChar?.team === 'a' ? 'var(--team-a-color)' : myChar?.team === 'b' ? 'var(--team-b-color)' : 'var(--accent-gold)';
      await addDoc(collection(db, `artifacts/${appId}/public/data/battles/${battleId}/chats`), {
          team: activeChatTab, senderId: userId, senderName, senderColor, message: chatInput, timestamp: serverTimestamp()
      });
      setChatInput('');
  };

  // --- Grid Interactions ---
  const handleCellClick = async (x: number, y: number) => {
      // Deployment
      if (gameState?.gameState === 'DEPLOYMENT' && placingCharId) {
          if (characters.some(c => c.x === x && c.y === y)) return;
          const char = characters.find(c => c.id === placingCharId);
          if (char?.team === 'a' && x >= 3) return;
          if (char?.team === 'b' && x <= 11) return;
          await updateDoc(doc(db, `artifacts/${appId}/public/data/battles/${battleId}/characters`, placingCharId), { x, y });
          setPlacingCharId(null);
          return;
      }

      // Combat
      if (gameState?.gameState === 'IN_PROGRESS' && isMyTurn && turnAction) {
          const char = currentTurnChar!;
          if (turnAction === 'move') {
              const moveStat = getStatIdForEffect(gameState.config, 'movement', 'agility');
              const range = char[moveStat] || 0;
              const reachable = getReachableCells(char, characters, range);
              if (reachable.some(p => p.x === x && p.y === y)) {
                  await updateDoc(doc(db, `artifacts/${appId}/public/data/battles/${battleId}/characters`, char.id), { x, y });
                  await updateDoc(doc(db, `artifacts/${appId}/public/data/battles/${battleId}`), { "turnActions.hasMoved": true, dialogue: dialogueInput ? {characterId: char.id, text: dialogueInput, timestamp: serverTimestamp()} : null });
                  handleAddLog(`<strong>${char.name}</strong> 이동` + (dialogueInput ? `: ${dialogueInput}` : ''));
                  setTurnAction(null); setDialogueInput('');
              }
          } else if (turnAction === 'attack') {
              if(Math.abs(x - char.x) + Math.abs(y - char.y) > 1) { showToast("사거리 밖입니다", "error"); return; }
              const target = characters.find(c => c.x === x && c.y === y && c.hp > 0);
              if (target && target.team !== char.team) {
                  // Attack Logic
                  const attId = getStatIdForEffect(gameState.config, 'baseAttack', 'attack');
                  const defId = getStatIdForEffect(gameState.config, 'baseDefense', 'defense');
                  const critId = getStatIdForEffect(gameState.config, 'critChance', 'luck');
                  
                  const roll = rollD6();
                  let msg = `<strong>${char.name}</strong> 공격 (Roll: ${roll})`;
                  let dmg = 0;
                  
                  if (roll > (char[attId] || 0)) msg += " ...빗나감!";
                  else {
                      let base = 5 * roll;
                      if (Math.random() * 10 < (char[critId] || 0)) { base *= 2; msg += " (치명타!)"; }
                      const defRoll = rollD6();
                      let red = (defRoll <= (target[defId] || 0)) ? 3 * defRoll : 0;
                      dmg = Math.max(1, base - red);
                      msg += ` -> <strong>${target.name}</strong>에게 ${dmg} 피해`;
                  }
                  
                  const batch = writeBatch(db);
                  if (dmg > 0) {
                    batch.update(doc(db, `artifacts/${appId}/public/data/battles/${battleId}/characters`, target.id), { hp: increment(-dmg), "stats.damageTaken": increment(dmg) });
                    batch.update(doc(db, `artifacts/${appId}/public/data/battles/${battleId}/characters`, char.id), { "stats.damageDealt": increment(dmg) });
                  }
                  batch.update(doc(db, `artifacts/${appId}/public/data/battles/${battleId}`), { "turnActions.hasActed": true, dialogue: dialogueInput ? {characterId: char.id, text: dialogueInput, timestamp: serverTimestamp()} : null });
                  await batch.commit();
                  handleAddLog(msg + (dialogueInput ? `: ${dialogueInput}` : ''));
                  setTurnAction(null); setDialogueInput('');
                  // Check win is handled by a separate effect/function ideally or backend trigger, here simplistic
                  setTimeout(checkWinCondition, 500);
              }
          } else if (turnAction === 'bandage') {
              const target = characters.find(c => c.x === x && c.y === y && c.hp > 0);
              if (target && target.team === char.team && Math.abs(x - char.x) + Math.abs(y - char.y) <= 1) {
                  if (target.hp >= target.maxHp) { showToast("체력이 가득 찼습니다", "error"); return; }
                  const healStat = getStatIdForEffect(gameState.config, 'healPower', 'luck');
                  const roll = rollD6();
                  const amount = Math.min((roll + (char[healStat] || 0)) * 5, target.maxHp - target.hp);
                  
                  const batch = writeBatch(db);
                  batch.update(doc(db, `artifacts/${appId}/public/data/battles/${battleId}/characters`, target.id), { hp: increment(amount) });
                  batch.update(doc(db, `artifacts/${appId}/public/data/battles/${battleId}/characters`, char.id), { bandages: increment(-1), "stats.healingDone": increment(amount) });
                  batch.update(doc(db, `artifacts/${appId}/public/data/battles/${battleId}`), { "turnActions.hasActed": true, dialogue: dialogueInput ? {characterId: char.id, text: dialogueInput, timestamp: serverTimestamp()} : null });
                  await batch.commit();
                  handleAddLog(`<strong>${char.name}</strong> -> ${target.name} 치유 (${amount})` + (dialogueInput ? `: ${dialogueInput}` : ''));
                  setTurnAction(null); setDialogueInput('');
              }
          }
      }
  };

  const handleEndTurn = async () => {
      const living = gameState!.turnOrder.filter(id => characters.find(c => c.id === id)?.hp! > 0);
      if (living.length === 0) return;
      let nextIdx = (living.indexOf(gameState!.currentTurnCharacterId!) + 1) % living.length;
      let nextTurnCount = gameState!.turnCount;
      if (gameState!.turnOrder.indexOf(living[nextIdx]) < gameState!.turnOrder.indexOf(gameState!.currentTurnCharacterId!)) nextTurnCount++;
      
      if (nextTurnCount > gameState!.config.maxTurns) {
           // Turn limit end logic simplified
           handleAddLog("턴 제한 종료!");
           await updateDoc(doc(db, `artifacts/${appId}/public/data/battles/${battleId}`), { gameState: 'GAME_OVER', winner: 'draw' });
           return;
      }

      await updateDoc(doc(db, `artifacts/${appId}/public/data/battles/${battleId}`), {
          currentTurnCharacterId: living[nextIdx], turnCount: nextTurnCount, turnActions: { hasMoved: false, hasActed: false }, dialogue: null
      });
      setTurnAction(null);
  };

  const checkWinCondition = async () => {
      const aAlive = characters.some(c => c.team === 'a' && c.hp > 0);
      const bAlive = characters.some(c => c.team === 'b' && c.hp > 0);
      if (!aAlive || !bAlive) {
          const winner = aAlive ? 'a' : (bAlive ? 'b' : 'draw');
          await updateDoc(doc(db, `artifacts/${appId}/public/data/battles/${battleId}`), { gameState: 'GAME_OVER', winner });
          // Save history
          const historyEntry = {
             title: `${gameState?.teamAName} vs ${gameState?.teamBName}`,
             winner,
             teamAName: gameState!.teamAName,
             teamBName: gameState!.teamBName,
             characters: characters.filter(c => c.team).map(({id, name, imageUrl, team, stats}) => ({id, name, imageUrl, team, stats})),
             timestamp: serverTimestamp()
          };
          await addDoc(collection(db, `artifacts/${appId}/public/data/battles/${battleId}/history`), historyEntry);
      }
  };

  const getHighlights = () => {
      if (!isMyTurn || !turnAction || !currentTurnChar) return [];
      if (turnAction === 'move') {
          const range = currentTurnChar[getStatIdForEffect(gameState!.config, 'movement', 'agility')] || 0;
          return getReachableCells(currentTurnChar, characters, range).map(p => ({ ...p, type: 'move' as const }));
      }
      if (turnAction === 'attack') return getTargetCells(currentTurnChar, 1).map(p => ({ ...p, type: 'attack' as const }));
      if (turnAction === 'bandage') return getHealableCells(currentTurnChar, characters, 1).map(p => ({ ...p, type: 'heal' as const }));
      return [];
  };

  if (!gameState) return <div className="text-white text-center mt-20">Loading...</div>;

  return (
    <div className="container mx-auto p-4 max-w-screen-2xl">
      {/* Header */}
      <header className="mb-4 flex flex-col md:flex-row justify-between items-center gap-4">
        <a href="/" className="text-[#a99985] hover:text-[#f2e9e4]">&larr; 대시보드</a>
        <div className="text-center">
            <h1 className="text-3xl font-bold text-[#c6a779] font-serif">{gameState.gameTitle}</h1>
            <p className="text-[#a99985] text-sm">{gameState.gameState === 'IN_PROGRESS' ? `TURN ${gameState.turnCount}` : gameState.gameState}</p>
        </div>
        <div className="flex gap-2">
            <button onClick={() => {navigator.clipboard.writeText(window.location.href); showToast("링크 복사 완료", "success")}} className="bg-[#3d352e] text-[#f2e9e4] px-3 py-1 rounded">초대 링크</button>
            <button onClick={() => setShowHistory(true)} className="bg-[#3d352e] text-[#f2e9e4] px-3 py-1 rounded">전투 기록</button>
            {isGM && <button onClick={() => setShowSettings(true)} className="bg-[#5f8fdb] text-white px-3 py-1 rounded">설정</button>}
            <button onClick={() => auth.signOut()} className="bg-[#3d352e] text-[#f2e9e4] px-3 py-1 rounded">로그아웃</button>
        </div>
      </header>

      {/* Main Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Panel (Roster) - Hidden during combat unless large screen */}
        <div className={`lg:col-span-3 space-y-4 ${gameState.gameState === 'IN_PROGRESS' ? 'hidden lg:block' : ''}`}>
             {(gameState.gameState === 'SETUP' || gameState.gameState === 'DEPLOYMENT') && isGM && (
                 <div className="bg-[#1e1b18] border border-[#4a3f35] p-4 rounded-lg space-y-2">
                     <button onClick={() => setShowCreateChar(true)} className="w-full bg-[#c6a779] text-[#0a0908] py-2 rounded font-bold">캐릭터 생성</button>
                     <button onClick={resetBattle} className="w-full bg-[#a13d3d] text-white py-2 rounded font-bold">전투 초기화</button>
                 </div>
             )}

             <div className="bg-[#1e1b18] border border-[#4a3f35] p-4 rounded-lg max-h-[70vh] overflow-y-auto">
                 <h2 className="text-xl font-bold text-[#c6a779] mb-4 border-b border-gray-700 pb-2">캐릭터 목록</h2>
                 <div className="space-y-3">
                     {characters.map(c => (
                         <div key={c.id} className="bg-[#141210] p-3 rounded flex gap-3 relative">
                             <img src={c.imageUrl || `https://placehold.co/80x80/1a1a1a/e0e0e0?text=${c.name[0]}`} className="w-12 h-12 rounded object-cover" />
                             <div className="flex-grow">
                                 <div className="flex justify-between">
                                     <span className="font-bold text-[#f2e9e4]">{c.name}</span>
                                     {c.ownerId && <span className="w-2 h-2 rounded-full bg-green-500" />}
                                 </div>
                                 <div className="text-xs text-[#a99985] mt-1">{c.hp}/{c.maxHp} HP</div>
                                 
                                 {/* Controls */}
                                 <div className="flex gap-1 mt-2 justify-end">
                                     {!c.ownerId && !myChar && !isGM && <button onClick={() => updateOwner(c.id, userId)} className="text-xs bg-[#c6a779] text-black px-2 rounded">획득</button>}
                                     {c.ownerId === userId && <button onClick={() => updateOwner(c.id, null)} className="text-xs bg-[#3d352e] text-[#f2e9e4] px-2 rounded">포기</button>}
                                     
                                     {isGM && (
                                         <>
                                            <button onClick={() => { setEditCharId(c.id); setShowCreateChar(true); }} className="text-xs bg-[#5f8fdb] text-white px-2 rounded">수정</button>
                                            <button onClick={() => deleteCharacter(c.id)} className="text-xs bg-[#a13d3d] text-white px-2 rounded">삭제</button>
                                            {gameState.gameState === 'SETUP' && (
                                                <>
                                                    <button onClick={() => joinTeam(c.id, 'a')} className="text-xs bg-[var(--team-a-color)] text-black px-2 rounded">A팀</button>
                                                    <button onClick={() => joinTeam(c.id, 'b')} className="text-xs bg-[var(--team-b-color)] text-white px-2 rounded">B팀</button>
                                                </>
                                            )}
                                         </>
                                     )}
                                     
                                     {gameState.gameState === 'DEPLOYMENT' && (c.ownerId === userId || isGM) && c.team && (
                                         c.x < 0 ? 
                                         <button onClick={() => setPlacingCharId(c.id)} className="text-xs bg-[#c6a779] text-black px-2 rounded">배치</button> :
                                         <button onClick={() => updateDoc(doc(db, `artifacts/${appId}/public/data/battles/${battleId}/characters`, c.id), {x: -1, y: -1})} className="text-xs bg-yellow-600 text-black px-2 rounded">회수</button>
                                     )}
                                 </div>
                             </div>
                         </div>
                     ))}
                 </div>
             </div>
        </div>

        {/* Center (Grid) */}
        <div className="lg:col-span-6 relative">
            {(gameState.gameState === 'SETUP' || gameState.gameState === 'DEPLOYMENT') && (
                <div className="bg-[#1e1b18] border border-[#4a3f35] p-4 rounded-lg mb-4">
                    <div className="grid grid-cols-2 gap-4 text-center">
                        <div>
                            <input value={gameState.teamAName} onChange={(e) => isGM && updateDoc(doc(db, `artifacts/${appId}/public/data/battles/${battleId}`), { teamAName: e.target.value })} disabled={!isGM} className="bg-transparent text-xl font-bold text-[#d4b28c] text-center w-full" />
                            <div className="text-sm text-[#a99985] min-h-[50px]">{characters.filter(c => c.team === 'a').map(c => c.name).join(', ')}</div>
                        </div>
                        <div>
                            <input value={gameState.teamBName} onChange={(e) => isGM && updateDoc(doc(db, `artifacts/${appId}/public/data/battles/${battleId}`), { teamBName: e.target.value })} disabled={!isGM} className="bg-transparent text-xl font-bold text-[#8c785d] text-center w-full" />
                            <div className="text-sm text-[#a99985] min-h-[50px]">{characters.filter(c => c.team === 'b').map(c => c.name).join(', ')}</div>
                        </div>
                    </div>
                    {isGM && gameState.gameState === 'SETUP' && characters.filter(c => c.team).length > 1 && (
                        <button onClick={() => updateDoc(doc(db, `artifacts/${appId}/public/data/battles/${battleId}`), { gameState: 'DEPLOYMENT' })} className="w-full mt-4 bg-[#c6a779] text-black font-bold py-2 rounded">배치 시작</button>
                    )}
                    {isGM && gameState.gameState === 'DEPLOYMENT' && characters.filter(c => c.team && c.x >= 0).length > 1 && (
                        <button onClick={startBattle} className="w-full mt-4 bg-[#5aa469] text-white font-bold py-2 rounded">전투 시작</button>
                    )}
                    {placingCharId && <p className="text-center text-[#c6a779] mt-2 font-bold animate-pulse">배치할 위치를 선택하세요</p>}
                </div>
            )}

            <div className="relative">
                 {gameState.gameState === 'IN_PROGRESS' && (
                     <div className="absolute top-2 left-1/2 transform -translate-x-1/2 z-20 text-[#c6a779] font-bold text-lg drop-shadow-md">
                         {timeLeft}s
                     </div>
                 )}
                 <BattleGrid 
                    characters={characters} 
                    currentTurnId={gameState.currentTurnCharacterId} 
                    onCellClick={handleCellClick}
                    highlights={getHighlights()}
                    deploymentMode={gameState.gameState === 'DEPLOYMENT'}
                    placingTeam={placingCharId ? characters.find(c => c.id === placingCharId)?.team : null}
                 />
                 
                 {/* Speech Bubbles */}
                 {gameState.dialogue && (
                     <SpeechBubble dialogue={gameState.dialogue} characters={characters} />
                 )}
            </div>

            {/* Action Menu Floating */}
            {gameState.gameState === 'IN_PROGRESS' && isMyTurn && currentTurnChar?.hp! > 0 && (
                <div 
                    className="fixed z-40 bg-[#1e1b18] border border-[#4a3f35] p-4 rounded-lg shadow-xl cursor-move touch-none"
                    style={{ left: `${actionPanelPos.x}%`, top: `${actionPanelPos.y}%`, transform: 'translate(-50%, -50%)' }}
                    onMouseDown={(e) => {
                        if((e.target as HTMLElement).tagName === 'BUTTON' || (e.target as HTMLElement).tagName === 'INPUT') return;
                        setIsDragging(true);
                        const startX = e.clientX; const startY = e.clientY;
                        const startLeft = actionPanelPos.x; const startTop = actionPanelPos.y;
                        const onMove = (me: MouseEvent) => {
                             const dx = (me.clientX - startX) / window.innerWidth * 100;
                             const dy = (me.clientY - startY) / window.innerHeight * 100;
                             setActionPanelPos({ x: startLeft + dx, y: startTop + dy });
                        };
                        const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); setIsDragging(false); };
                        document.addEventListener('mousemove', onMove);
                        document.addEventListener('mouseup', onUp);
                    }}
                >
                    <div className="text-center font-bold text-[#c6a779] mb-2">{currentTurnChar.name}의 턴</div>
                    <div className="flex gap-2 mb-2">
                        <input value={dialogueInput} onChange={e => setDialogueInput(e.target.value)} placeholder="대사 입력" className="bg-[#141210] border border-[#4a3f35] rounded px-2 py-1 text-sm text-[#f2e9e4] w-32" />
                        <button onClick={() => updateDoc(doc(db, `artifacts/${appId}/public/data/battles/${battleId}`), { dialogue: {characterId: currentTurnChar.id, text: dialogueInput, timestamp: serverTimestamp()} })} className="bg-[#3d352e] text-white px-2 rounded text-xs">말하기</button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <button onClick={() => setTurnAction('move')} disabled={gameState.turnActions.hasMoved} className="bg-[var(--team-a-color)] text-black px-3 py-2 rounded font-bold disabled:opacity-50">이동</button>
                        <button onClick={() => setTurnAction('attack')} disabled={gameState.turnActions.hasActed} className="bg-[#a13d3d] text-white px-3 py-2 rounded font-bold disabled:opacity-50">공격</button>
                        <button onClick={() => setTurnAction('bandage')} disabled={gameState.turnActions.hasActed || currentTurnChar.bandages <= 0} className="bg-[#5aa469] text-white px-3 py-2 rounded font-bold disabled:opacity-50">치유</button>
                        <button onClick={handleEndTurn} className="bg-[#3d352e] text-[#f2e9e4] px-3 py-2 rounded font-bold">종료</button>
                    </div>
                    {turnAction && <div className="text-center text-xs text-[#c6a779] mt-2 font-bold">{turnAction === 'move' ? '이동할 곳 선택' : '대상 선택'}</div>}
                </div>
            )}
        </div>

        {/* Right Panel (Chat & Logs) */}
        <div className="lg:col-span-3 h-[80vh] flex flex-col gap-4">
             <div className="bg-[#1e1b18] border border-[#4a3f35] rounded-lg p-4 flex-1 flex flex-col min-h-0">
                 <div className="flex border-b border-gray-700 mb-2">
                     <button onClick={() => setActiveTab('log')} className={`flex-1 pb-2 ${activeTab === 'log' ? 'text-[#c6a779] border-b-2 border-[#c6a779]' : 'text-[#a99985]'}`}>로그</button>
                     <button onClick={() => setActiveTab('stats')} className={`flex-1 pb-2 ${activeTab === 'stats' ? 'text-[#c6a779] border-b-2 border-[#c6a779]' : 'text-[#a99985]'}`}>통계</button>
                 </div>
                 <div className="flex-1 overflow-y-auto min-h-0 bg-[#141210] p-2 rounded text-sm space-y-1" ref={logContainerRef}>
                     {activeTab === 'log' ? logs.map(l => <div key={l.id} className="text-[#f2e9e4]" dangerouslySetInnerHTML={{__html: l.html}} />) : 
                        // Damage Meter
                        characters.filter(c => c.stats).sort((a,b) => b.stats.damageDealt - a.stats.damageDealt).map(c => (
                            <div key={c.id} className="flex justify-between items-center text-xs">
                                <span>{c.name}</span>
                                <div className="flex gap-2">
                                    <span className="text-red-400">{c.stats.damageDealt}</span>
                                    <span className="text-blue-400">{c.stats.damageTaken}</span>
                                    <span className="text-green-400">{c.stats.healingDone}</span>
                                </div>
                            </div>
                        ))
                     }
                 </div>
             </div>

             <div className="bg-[#1e1b18] border border-[#4a3f35] rounded-lg p-4 flex-1 flex flex-col min-h-0">
                 <h3 className="font-bold text-[#c6a779] mb-2">채팅</h3>
                 <div className="flex border-b border-gray-700 mb-2">
                     <button onClick={() => setActiveChatTab('a')} className={`flex-1 pb-1 text-sm ${activeChatTab === 'a' ? 'text-[var(--team-a-color)] border-b' : 'text-gray-500'}`}>Team A</button>
                     <button onClick={() => setActiveChatTab('b')} className={`flex-1 pb-1 text-sm ${activeChatTab === 'b' ? 'text-[var(--team-b-color)] border-b' : 'text-gray-500'}`}>Team B</button>
                 </div>
                 <div className="flex-1 overflow-y-auto min-h-0 bg-[#141210] p-2 rounded text-sm space-y-2 mb-2" ref={chatContainerRef}>
                     {chats.filter(c => c.team === activeChatTab).map(c => (
                         <div key={c.id}>
                             <span style={{color: c.senderColor}} className="font-bold">{c.senderName}:</span> <span className="text-[#f2e9e4]">{c.message}</span>
                         </div>
                     ))}
                 </div>
                 <form onSubmit={sendChat} className="flex gap-2">
                     <input value={chatInput} onChange={e => setChatInput(e.target.value)} className="flex-1 bg-[#141210] border border-[#4a3f35] rounded px-2 py-1 text-sm text-[#f2e9e4]" placeholder="메시지..." />
                     <button type="submit" className="bg-[#c6a779] text-black px-3 py-1 rounded text-sm font-bold">전송</button>
                 </form>
             </div>
        </div>
      </div>

      {/* Modals */}
      {showCreateChar && gameState.config && <CharacterModal mode={editCharId ? 'edit' : 'create'} initialData={editCharId ? characters.find(c => c.id === editCharId) : undefined} config={gameState.config} onClose={() => {setShowCreateChar(false); setEditCharId(null);}} onSubmit={editCharId ? handleUpdateChar : handleCreateChar} />}
      {showSettings && <SettingsModal battleId={battleId} config={gameState.config} onClose={() => setShowSettings(false)} />}
      {showHistory && <HistoryModal battleId={battleId} history={history} isGM={isGM} onClose={() => setShowHistory(false)} />}
      
      {/* BGM */}
      <BGMPlayer playlistString={gameState.config.bgmUrl} isPlaying={gameState.gameState === 'IN_PROGRESS' || gameState.gameState === 'GAME_OVER'} />
      
      {/* Game Over Overlay */}
      {gameState.gameState === 'GAME_OVER' && (
          <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50">
              <div className="bg-[#1e1b18] border border-[#4a3f35] p-8 rounded-lg text-center">
                  <h2 className="text-4xl font-bold text-[#c6a779] mb-4">
                      {gameState.winner === 'draw' ? '무승부!' : `👑 ${gameState.winner === 'a' ? gameState.teamAName : gameState.teamBName} 승리! 👑`}
                  </h2>
                  <p className="text-[#a99985] mb-8">전투가 종료되었습니다.</p>
                  {isGM && <button onClick={resetBattle} className="bg-[#c6a779] text-black px-6 py-3 rounded-lg font-bold text-xl hover:bg-[#d6b88a]">새 전투 준비</button>}
              </div>
          </div>
      )}
    </div>
  );
};

const SpeechBubble: React.FC<{ dialogue: any, characters: Character[] }> = ({ dialogue, characters }) => {
    const char = characters.find(c => c.id === dialogue.characterId);
    if (!char || !char.x || char.x < 0) return null;
    
    // Calculate position (simple approx based on grid % or static calculation)
    // In a real generic grid, we'd need exact pixel logic or refs. 
    // Here we use absolute positioning percentages based on 15x10 grid.
    const left = (char.x / 15 * 100) + (100/15/2); 
    const top = (char.y / 10 * 100);

    return (
        <div 
            key={dialogue.timestamp?.toMillis()}
            className="speech-bubble-anim absolute bg-[#141210] border border-[#4a3f35] text-[#f2e9e4] px-3 py-1 rounded-lg text-sm z-30 pointer-events-none whitespace-nowrap"
            style={{ left: `${left}%`, top: `${top}%`, transform: 'translate(-50%, -100%)' }}
        >
            {dialogue.text}
            <div className="absolute top-full left-1/2 -translate-x-1/2 border-[6px] border-transparent border-t-[#4a3f35]" />
        </div>
    );
}

export default GameRoom;
