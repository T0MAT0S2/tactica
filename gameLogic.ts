import { Character, GameConfig } from './types';

export const GRID_COLS = 15;
export const GRID_ROWS = 10;

export const STAT_EFFECTS = {
    none: '효과 없음',
    baseAttack: '공격 성공률',
    baseDefense: '피해 감소율',
    movement: '이동력',
    maxHp: '최대 체력',
    critChance: '치명타 확률',
    healPower: '치유량',
};

export const getStatIdForEffect = (config: GameConfig, effect: string, fallback: string) => {
    return config.stats.find(s => s.effect === effect)?.id || fallback;
};

export const rollD6 = () => Math.floor(Math.random() * 6) + 1;

export const getReachableCells = (char: Character, allChars: Character[], movement: number) => {
    const q: [{x: number, y: number}, number][] = [[{ x: char.x, y: char.y }, 0]];
    const visited = new Set([`${char.x},${char.y}`]);
    const reachable: {x: number, y: number}[] = [];
    const occupied = new Set(allChars.filter(c => c.hp > 0 && c.id !== char.id).map(c => `${c.x},${c.y}`));

    while (q.length > 0) {
        const [curr, dist] = q.shift()!;
        if (dist > 0) reachable.push(curr);
        if (dist < movement) {
            [[0, 1], [0, -1], [1, 0], [-1, 0]].forEach(([dx, dy]) => {
                const next = { x: curr.x + dx, y: curr.y + dy };
                if (next.x >= 0 && next.x < GRID_COLS && next.y >= 0 && next.y < GRID_ROWS && !visited.has(`${next.x},${next.y}`) && !occupied.has(`${next.x},${next.y}`)) {
                    visited.add(`${next.x},${next.y}`);
                    q.push([next, dist + 1]);
                }
            });
        }
    }
    return reachable;
};

export const getTargetCells = (char: Character, range: number) => {
    const cells: {x: number, y: number}[] = [];
    for (let y = 0; y < GRID_ROWS; y++) for (let x = 0; x < GRID_COLS; x++) {
        if (Math.abs(x - char.x) + Math.abs(y - char.y) <= range) cells.push({ x, y });
    }
    return cells;
};

export const getHealableCells = (char: Character, allChars: Character[], range: number) => {
    return allChars.filter(c =>
        c.team === char.team && c.hp > 0 && (Math.abs(c.x - char.x) + Math.abs(c.y - char.y) <= range)
    ).map(c => ({x: c.x, y: c.y}));
};
