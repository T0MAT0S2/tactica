import React from 'react';
import { Character } from '../types';
import { GRID_ROWS, GRID_COLS } from '../gameLogic';

interface BattleGridProps {
  characters: Character[];
  currentTurnId: string | null;
  onCellClick: (x: number, y: number) => void;
  highlights: { x: number; y: number; type: 'move' | 'attack' | 'heal' }[];
  deploymentMode: boolean;
  placingTeam?: 'a' | 'b' | null;
}

const BattleGrid: React.FC<BattleGridProps> = ({ characters, currentTurnId, onCellClick, highlights, deploymentMode, placingTeam }) => {
  const getCellClass = (x: number, y: number) => {
    let classes = "bg-[#1c2431] relative transition-colors duration-200 border-[0.5px] border-[#2a2522] ";
    
    // Highlight logic
    const highlight = highlights.find(h => h.x === x && h.y === y);
    if (highlight) {
        if (highlight.type === 'move') classes += "bg-[rgba(95,168,211,0.5)] cursor-pointer ";
        else if (highlight.type === 'attack') classes += "bg-[rgba(202,60,60,0.5)] cursor-pointer ";
        else if (highlight.type === 'heal') classes += "bg-[rgba(90,164,105,0.5)] cursor-pointer ";
    }

    // Deployment zones
    if (deploymentMode && placingTeam) {
        if (placingTeam === 'a' && x < 3) classes += "bg-[rgba(212,178,140,0.2)] cursor-pointer ";
        if (placingTeam === 'b' && x > 11) classes += "bg-[rgba(140,120,93,0.2)] cursor-pointer ";
    }

    return classes;
  };

  const renderCells = () => {
    const cells = [];
    for (let y = 0; y < GRID_ROWS; y++) {
      for (let x = 0; x < GRID_COLS; x++) {
        const char = characters.find(c => c.x === x && c.y === y);
        const isTurn = char && char.id === currentTurnId;
        
        cells.push(
          <div key={`${x}-${y}`} className={getCellClass(x, y)} onClick={() => onCellClick(x, y)} style={{ aspectRatio: '1/1' }}>
            {char && (
              <div 
                className={`absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[90%] h-[90%] rounded-full border-[3px] bg-cover bg-center shadow-lg transition-all duration-300 z-[5] ${isTurn ? 'scale-110 shadow-[0_0_20px_5px_#c6a779] z-[10]' : ''} ${char.hp <= 0 ? 'grayscale brightness-50' : ''}`}
                style={{ 
                    backgroundImage: `url(${char.imageUrl || `https://placehold.co/80x80/1a1a1a/e0e0e0?text=${char.name.charAt(0)}`})`,
                    borderColor: char.team === 'a' ? 'var(--team-a-color)' : 'var(--team-b-color)'
                }}
              >
                  {/* HP Bar */}
                  <div className="absolute -bottom-1 left-0 w-full h-1.5 bg-black/50 rounded overflow-hidden">
                      <div className="h-full bg-green-500" style={{ width: `${Math.max(0, (char.hp / char.maxHp) * 100)}%` }}></div>
                  </div>
              </div>
            )}
          </div>
        );
      }
    }
    return cells;
  };

  return (
    <div className="w-full aspect-[15/10] bg-black border-2 border-[#4a3f35] rounded-lg grid grid-cols-[repeat(15,1fr)] gap-[2px] relative">
      {renderCells()}
    </div>
  );
};

export default BattleGrid;
