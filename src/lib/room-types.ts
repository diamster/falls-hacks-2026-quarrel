import type { GameMode, PlayerIdentity, TeamId } from "./game-modes";
export type PlayerSlot = "A" | "B";

export interface RoomPlayer {
  /** Reserved optional fields only; no selection/team endpoints exist yet. */
  playerId?: PlayerIdentity;
  teamId?: TeamId | null;
  selectedCharacterId?: string | null;
  slot: PlayerSlot;
  name: string;
  ready: boolean;
  connected: boolean;
}

export interface RoomSnapshot {
  id: string;
  code: string;
  expiresAt: string;
  you: PlayerSlot;
  players: RoomPlayer[];
  bothReady: boolean;
  themeId?: string;
  themeLocked?: boolean;
  mode?: GameMode;
  capacity?: number;
}

export interface RoomResponse {
  room: RoomSnapshot | null;
  realtime?: { url: string; key: string; accessToken: string };
}
