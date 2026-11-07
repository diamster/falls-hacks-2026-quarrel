import type { GameMode, PlayerIdentity, TeamId } from "./game-modes";
import type { DebateSnapshot } from "./debate-types";
import type { JudgeSnapshot } from "./judge-types";
import type { LawyerDebateSnapshot } from "./lawyer-types";
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
  debate?: DebateSnapshot;
  judge?: JudgeSnapshot;
  lawyer?: LawyerDebateSnapshot;
}

export interface RoomResponse {
  room: RoomSnapshot | null;
  realtime?: { url: string; key: string; accessToken: string };
}
