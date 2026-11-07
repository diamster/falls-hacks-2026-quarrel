export const characterStates = ["idle", "speaking", "listening", "thinking", "questioning", "surprised", "objection", "verdict"] as const;
export type CharacterState = typeof characterStates[number];
export type CharacterId = "lion" | "zebra" | "lemur";
export type CharacterStates = Record<CharacterId, CharacterState>;

export const characters = {
  lion: { name: "Leo", species: "Lion", role: "Player A", stance: "FOR", color: "gold" },
  zebra: { name: "Zuri", species: "Zebra", role: "Player B", stance: "AGAINST", color: "coral" },
  lemur: { name: "Judge Moki", species: "Lemur", role: "AI judge", stance: "NEUTRAL", color: "mint" },
} as const;

export const initialStates: CharacterStates = { lion: "idle", zebra: "idle", lemur: "speaking" };

export const judgeDialogue = [
  { label: "Welcome to court", text: "Order in the jungle! Big opinions welcome. Keep it kind, keep it convincing." },
  { label: "A little encouragement", text: "An interesting point! A strong argument needs more than a very confident roar." },
  { label: "A question for both sides", text: "Let’s peel this back. What’s one thing the other side might be right about?" },
  { label: "Objection preview", text: "Objection heard! Take a breath, hold the bananas, and let’s hear the other perspective." },
] as const;

export interface DebateEntry { id: string; speaker: CharacterId; text: string; tag: "Sample" | "Local preview" }
export const sampleHistory: DebateEntry[] = [
  { id: "sample-1", speaker: "lion", text: "Sweet and salty is a winning team. Pineapple brings a little sunshine to every slice.", tag: "Sample" },
  { id: "sample-2", speaker: "zebra", text: "Fruit has its place. I’m just not convinced that place is on my pizza.", tag: "Sample" },
];

export function isAnimatedState(state: CharacterState): boolean {
  return state === "idle" || state === "speaking";
}
