export type PlayerSlot = "A" | "B";

export interface RoomPlayer {
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
}

export interface RoomResponse {
  room: RoomSnapshot | null;
  realtime?: { url: string; key: string; accessToken: string };
}
