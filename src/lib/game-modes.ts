/** Only solo is playable. Future team membership is separate from player identity. */
export type GameMode = "solo" | "teams";
export type TeamId = "A" | "B";
export type PlayerIdentity = string;
export interface RoundRepresentativeAssignment {
  roundId: string;
  teamId: TeamId;
  representativePlayerId: PlayerIdentity;
}
const solo = Object.freeze({ id: "solo" as const, maxPlayers: 2, slots: ["A", "B"] as const });
export const playableModes = Object.freeze({ solo });
/** Unknown/future modes cannot enable extra seats or team functionality. */
export function getGameMode(_mode: unknown = "solo") { return playableModes.solo; }
