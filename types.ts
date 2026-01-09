import { Timestamp } from 'firebase/firestore';

export interface GameConfig {
  statPoints: { min: number; max: number };
  maxTurns: number;
  maxStatValue: number;
  bgmUrl: string;
  stats: { id: string; name: string; effect: string }[];
}

export interface Character {
  id: string;
  name: string;
  imageUrl: string;
  hp: number;
  maxHp: number;
  x: number;
  y: number;
  ownerId: string | null;
  team: 'a' | 'b' | null;
  createdAt: any; // Firestore Timestamp
  bandages: number;
  stats: {
    damageDealt: number;
    damageTaken: number;
    healingDone: number;
    [key: string]: number; // Allow dynamic stats
  } & Record<string, number>; // Dynamic base stats like attack, defense
}

export interface Dialogue {
  characterId: string;
  text: string;
  timestamp: any;
}

export interface TurnActions {
  hasMoved: boolean;
  hasActed: boolean;
}

export interface GameState {
  id?: string; // Document ID
  gmId: string;
  gameTitle: string;
  gameState: 'SETUP' | 'DEPLOYMENT' | 'IN_PROGRESS' | 'GAME_OVER';
  teamAName: string;
  teamBName: string;
  createdAt: any;
  currentTurnCharacterId: string | null;
  turnOrder: string[];
  winner: 'a' | 'b' | 'draw' | null;
  turnCount: number;
  turnActions: TurnActions;
  dialogue: Dialogue | null;
  config: GameConfig;
}

export interface ChatMessage {
  id: string;
  team: string;
  senderId: string;
  senderName: string;
  senderColor: string;
  message: string;
  timestamp: any;
}

export interface LogEntry {
  id: string;
  html: string;
  timestamp: any;
}

export interface HistoryEntry {
  id: string;
  title: string;
  winner: 'a' | 'b' | 'draw' | null;
  teamAName: string;
  teamBName: string;
  characters: Partial<Character>[];
  timestamp: any;
}

export interface ToastData {
  id: number;
  message: string;
  type: 'info' | 'success' | 'error';
}