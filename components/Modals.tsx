import React, { useState, useEffect } from 'react';
import { GameConfig, Character, HistoryEntry } from '../types';
import { STAT_EFFECTS } from '../gameLogic';
import { writeBatch, collection, getDocs, deleteField, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage, getAppId } from '../firebase';
import { showToast } from './Toast';

// --- Create/Edit Character Modal ---
interface CharModalProps {
  onClose: () => void;
  onSubmit: (data: any) => void;
  config: GameConfig;
  initialData?: Character;
  mode: 'create' | 'edit';
}

export const CharacterModal: React.FC<CharModalProps> = ({ onClose, onSubmit, config, initialData, mode }) => {
    const [name, setName] = useState(initialData?.name || '');
    const [imageUrl, setImageUrl] = useState(initialData?.imageUrl || '');
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const [stats, setStats] = useState<Record<string, number>>({});

    useEffect(() => {
        const initialStats: Record<string, number> = {};
        config.stats.forEach(s => {
            // Fix access to Character dynamic props by casting to any
            initialStats[s.id] = initialData ? ((initialData as any)[s.id] || 3) : 3;
        });
        setStats(initialStats);
    }, [config, initialData]);

    const totalStats = Object.values(stats).reduce((a: number, b: number) => a + b, 0) as number;
    const isValid = totalStats >= config.statPoints.min && totalStats <= config.statPoints.max;

    const handleStatChange = (id: string, delta: number) => {
        const current = stats[id] || 0;
        const newVal = current + delta;
        const newTotal = totalStats + delta;
        if (newVal < 1 || newVal > config.maxStatValue) return;
        if (newTotal > config.statPoints.max) { showToast("총 스탯 한도 초과", "error"); return; }
        setStats(prev => ({ ...prev, [id]: newVal }));
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setImageFile(e.target.files[0]);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!isValid) { showToast(`총 스탯은 ${config.statPoints.min}~${config.statPoints.max} 사이여야 합니다.`, "error"); return; }
        
        let finalImageUrl = imageUrl;

        if (imageFile) {
            setUploading(true);
            try {
                const storageRef = ref(storage, `uploads/${Date.now()}_${imageFile.name}`);
                await uploadBytes(storageRef, imageFile);
                finalImageUrl = await getDownloadURL(storageRef);
            } catch (error) {
                console.error("Image upload failed", error);
                showToast("이미지 업로드에 실패했습니다.", "error");
                setUploading(false);
                return;
            }
            setUploading(false);
        }

        onSubmit({ name, imageUrl: finalImageUrl, ...stats });
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 backdrop-blur-sm z-[90]">
            <div className="bg-[#1e1b18] border border-[#4a3f35] p-6 rounded-lg w-full max-w-md relative">
                <button onClick={onClose} className="absolute top-4 right-4 text-[#a99985] hover:text-[#f2e9e4] font-bold text-xl">&times;</button>
                <h2 className="text-2xl font-semibold mb-4 border-b border-gray-700 pb-2 text-[#c6a779]">SYSTEM: 캐릭터 {mode === 'create' ? '생성' : '수정'}</h2>
                <form onSubmit={handleSubmit} className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
                    <input type="text" placeholder="이름" value={name} onChange={e => setName(e.target.value)} className="w-full bg-[#141210] border border-[#4a3f35] p-3 rounded text-[#f2e9e4] outline-none" required />
                    
                    <div className="space-y-2">
                        <label className="block text-sm text-[#a99985]">프로필 이미지</label>
                        <input type="file" accept="image/*" onChange={handleFileChange} className="w-full bg-[#141210] border border-[#4a3f35] p-2 rounded text-[#f2e9e4] text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-[#3d352e] file:text-[#c6a779] hover:file:bg-[#4a3f35]" />
                        <div className="text-center text-xs text-[#a99985]">- 또는 -</div>
                        <input type="url" placeholder="이미지 주소 (URL) 직접 입력" value={imageUrl} onChange={e => setImageUrl(e.target.value)} className="w-full bg-[#141210] border border-[#4a3f35] p-3 rounded text-[#f2e9e4] outline-none text-sm" />
                    </div>
                    
                    <div className="space-y-2 mt-4">
                        {config.stats.map(s => (
                            <div key={s.id} className="flex justify-between items-center">
                                <label className="text-[#a99985] w-1/4">{s.name}</label>
                                <div className="flex items-center gap-2">
                                    <button type="button" onClick={() => handleStatChange(s.id, -1)} className="w-7 h-7 rounded-full border border-[#4a3f35] bg-[#141210] text-[#a99985] hover:bg-[#383838]">-</button>
                                    <div className="flex gap-1">
                                        {[...Array(config.maxStatValue)].map((_, i) => (
                                            <div key={i} className={`w-3 h-3 rounded-sm ${i < (stats[s.id] || 0) ? 'bg-[#c6a779]' : 'bg-[#141210] border border-[#444]'}`} />
                                        ))}
                                    </div>
                                    <button type="button" onClick={() => handleStatChange(s.id, 1)} className="w-7 h-7 rounded-full border border-[#4a3f35] bg-[#141210] text-[#a99985] hover:bg-[#383838]">+</button>
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className={`text-center font-bold my-2 ${!isValid ? 'text-red-500' : 'text-[#c6a779]'}`}>
                        총 스탯: {totalStats} ({config.statPoints.min} ~ {config.statPoints.max})
                    </div>
                    <button type="submit" disabled={uploading} className="w-full bg-[#c6a779] text-[#0a0908] border border-[#e0c598] py-2 rounded font-bold hover:bg-[#d6b88a] disabled:opacity-50">
                        {uploading ? '이미지 업로드 중...' : (mode === 'create' ? '생성' : '수정 완료')}
                    </button>
                </form>
            </div>
        </div>
    );
};

// --- Game Settings Modal ---
interface SettingsModalProps {
    onClose: () => void;
    config: GameConfig;
    battleId: string;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ onClose, config, battleId }) => {
    const [localConfig, setLocalConfig] = useState(config);
    const [newStatName, setNewStatName] = useState('');

    const handleStatRemove = (id: string) => {
        setLocalConfig(prev => ({ ...prev, stats: prev.stats.filter(s => s.id !== id) }));
    };

    const handleStatAdd = () => {
        if (!newStatName.trim()) return;
        const id = newStatName.toLowerCase().replace(/\s/g, '');
        if (localConfig.stats.some(s => s.id === id)) return;
        setLocalConfig(prev => ({ ...prev, stats: [...prev.stats, { id, name: newStatName, effect: 'none' }] }));
        setNewStatName('');
    };

    const handleSave = async () => {
        try {
            const batch = writeBatch(db);
            const battleRef = doc(db, `artifacts/${getAppId()}/public/data/battles/${battleId}`);
            batch.update(battleRef, { config: localConfig });

            // Remove deleted stats from characters
            const deletedStats = config.stats.filter(s => !localConfig.stats.some(ls => ls.id === s.id));
            if (deletedStats.length > 0) {
                const charsSnap = await getDocs(collection(db, `artifacts/${getAppId()}/public/data/battles/${battleId}/characters`));
                const fieldsToRemove: any = {};
                deletedStats.forEach(s => fieldsToRemove[s.id] = deleteField());
                charsSnap.docs.forEach(d => batch.update(d.ref, fieldsToRemove));
            }

            await batch.commit();
            showToast("설정 저장 완료", "success");
            onClose();
        } catch (e) {
            showToast("저장 실패", "error");
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 backdrop-blur-sm z-[90]">
            <div className="bg-[#1e1b18] border border-[#4a3f35] p-6 rounded-lg w-full max-w-2xl relative max-h-[80vh] flex flex-col">
                <button onClick={onClose} className="absolute top-4 right-4 text-[#a99985] hover:text-[#f2e9e4] font-bold text-xl">&times;</button>
                <h2 className="text-2xl font-semibold mb-4 border-b border-gray-700 pb-2 text-[#c6a779]">SYSTEM: 게임 설정</h2>
                <div className="overflow-y-auto pr-2 flex-grow space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div><label className="text-sm text-[#a99985]">최대 턴 수</label><input type="number" value={localConfig.maxTurns} onChange={e => setLocalConfig({...localConfig, maxTurns: parseInt(e.target.value)})} className="w-full bg-[#141210] border border-[#4a3f35] p-2 rounded text-[#f2e9e4]" /></div>
                        <div><label className="text-sm text-[#a99985]">스탯별 최대치</label><input type="number" value={localConfig.maxStatValue} onChange={e => setLocalConfig({...localConfig, maxStatValue: parseInt(e.target.value)})} className="w-full bg-[#141210] border border-[#4a3f35] p-2 rounded text-[#f2e9e4]" /></div>
                        <div><label className="text-sm text-[#a99985]">최소 스탯 총합</label><input type="number" value={localConfig.statPoints.min} onChange={e => setLocalConfig({...localConfig, statPoints: {...localConfig.statPoints, min: parseInt(e.target.value)}})} className="w-full bg-[#141210] border border-[#4a3f35] p-2 rounded text-[#f2e9e4]" /></div>
                        <div><label className="text-sm text-[#a99985]">최대 스탯 총합</label><input type="number" value={localConfig.statPoints.max} onChange={e => setLocalConfig({...localConfig, statPoints: {...localConfig.statPoints, max: parseInt(e.target.value)}})} className="w-full bg-[#141210] border border-[#4a3f35] p-2 rounded text-[#f2e9e4]" /></div>
                    </div>
                    <div>
                        <label className="text-sm text-[#a99985]">BGM URL (쉼표 구분)</label>
                        <textarea value={localConfig.bgmUrl} onChange={e => setLocalConfig({...localConfig, bgmUrl: e.target.value})} className="w-full bg-[#141210] border border-[#4a3f35] p-2 rounded text-[#f2e9e4] min-h-[60px]" />
                    </div>
                    <div>
                        <h3 className="font-bold text-[#c6a779] mb-2">스탯 종류 및 효과</h3>
                        <div className="space-y-2">
                            {localConfig.stats.map(s => (
                                <div key={s.id} className="grid grid-cols-3 gap-2">
                                    <input value={s.name} onChange={e => {
                                        const newStats = [...localConfig.stats];
                                        newStats.find(x => x.id === s.id)!.name = e.target.value;
                                        setLocalConfig({...localConfig, stats: newStats});
                                    }} className="bg-[#141210] border border-[#4a3f35] p-2 rounded text-[#f2e9e4]" />
                                    <select value={s.effect} onChange={e => {
                                        const newStats = [...localConfig.stats];
                                        newStats.find(x => x.id === s.id)!.effect = e.target.value;
                                        setLocalConfig({...localConfig, stats: newStats});
                                    }} className="bg-[#141210] border border-[#4a3f35] p-2 rounded text-[#f2e9e4]">
                                        {Object.entries(STAT_EFFECTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                                    </select>
                                    <button onClick={() => handleStatRemove(s.id)} className="bg-[#a13d3d] text-white rounded">삭제</button>
                                </div>
                            ))}
                            <div className="flex gap-2 mt-2">
                                <input placeholder="새 스탯 이름" value={newStatName} onChange={e => setNewStatName(e.target.value)} className="flex-grow bg-[#141210] border border-[#4a3f35] p-2 rounded text-[#f2e9e4]" />
                                <button onClick={handleStatAdd} className="bg-[#3d352e] text-[#f2e9e4] px-3 rounded">추가</button>
                            </div>
                        </div>
                    </div>
                </div>
                <button onClick={handleSave} className="w-full mt-4 bg-[#c6a779] text-[#0a0908] py-3 rounded font-bold hover:bg-[#d6b88a]">저장</button>
            </div>
        </div>
    );
};

// --- History Modal ---
interface HistoryModalProps {
    onClose: () => void;
    history: HistoryEntry[];
    isGM: boolean;
    battleId: string;
}

export const HistoryModal: React.FC<HistoryModalProps> = ({ onClose, history, isGM, battleId }) => {
    const [selectedId, setSelectedId] = useState<string | null>(history[0]?.id || null);
    
    const selectedHistory = history.find(h => h.id === selectedId);

    const deleteEntry = async (id: string) => {
        if (!window.confirm("삭제하시겠습니까?")) return;
        await deleteDoc(doc(db, `artifacts/${getAppId()}/public/data/battles/${battleId}/history`, id));
    };

    const updateTitle = async (id: string, title: string) => {
        await updateDoc(doc(db, `artifacts/${getAppId()}/public/data/battles/${battleId}/history`, id), { title });
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 backdrop-blur-sm z-[90]">
            <div className="bg-[#1e1b18] border border-[#4a3f35] p-6 rounded-lg w-full max-w-4xl h-[80vh] relative flex flex-col">
                <button onClick={onClose} className="absolute top-4 right-4 text-[#a99985] hover:text-[#f2e9e4] font-bold text-xl">&times;</button>
                <h2 className="text-2xl font-semibold mb-4 border-b border-gray-700 pb-2 text-[#c6a779]">전투 기록</h2>
                <div className="flex-grow flex gap-4 overflow-hidden">
                    <div className="w-1/3 border-r border-gray-700 pr-2 overflow-y-auto space-y-2">
                        {history.map(h => (
                            <div key={h.id} onClick={() => setSelectedId(h.id)} className={`p-3 rounded cursor-pointer ${selectedId === h.id ? 'bg-[#2a2522]' : 'bg-[#141210]'} hover:bg-[#2a2522] relative group`}>
                                {isGM ? (
                                    <input defaultValue={h.title} onBlur={e => updateTitle(h.id, e.target.value)} className="bg-transparent font-bold text-[#f2e9e4] w-full focus:outline-none" />
                                ) : <p className="font-bold text-[#f2e9e4]">{h.title}</p>}
                                <p className="text-xs text-[#a99985]">{h.winner === 'draw' ? '무승부' : (h.winner === 'a' ? 'A팀 승리' : 'B팀 승리')}</p>
                                {isGM && <button onClick={(e) => {e.stopPropagation(); deleteEntry(h.id);}} className="absolute top-2 right-2 text-gray-500 hover:text-red-500 opacity-0 group-hover:opacity-100">&times;</button>}
                            </div>
                        ))}
                    </div>
                    <div className="w-2/3 overflow-y-auto">
                        {selectedHistory ? (
                            <div className="space-y-6">
                                {['a', 'b'].map(team => {
                                    const teamName = team === 'a' ? selectedHistory.teamAName : selectedHistory.teamBName;
                                    const chars = selectedHistory.characters.filter(c => c.team === team);
                                    return (
                                        <div key={team}>
                                            <h4 className="text-lg font-bold mb-2" style={{ color: team === 'a' ? 'var(--team-a-color)' : 'var(--team-b-color)' }}>{teamName}</h4>
                                            <div className="bg-[#141210] p-2 rounded">
                                                 {chars.map((c, i) => (
                                                     <div key={i} className="flex justify-between text-sm py-1 border-b border-gray-800 last:border-0">
                                                         <span className="text-[#f2e9e4]">{c.name}</span>
                                                         <div className="flex gap-4">
                                                             <span className="text-red-400">딜: {c.stats?.damageDealt}</span>
                                                             <span className="text-blue-400">피격: {c.stats?.damageTaken}</span>
                                                         </div>
                                                     </div>
                                                 ))}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        ) : <p className="text-[#a99985] text-center mt-10">기록을 선택하세요.</p>}
                    </div>
                </div>
            </div>
        </div>
    );
};