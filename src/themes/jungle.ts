import { neutralityPolicy, type ThemeConfig } from "./types";

export const jungle: ThemeConfig = {
  id: "jungle", displayName: "Jungle", description: "Big opinions beneath the palms. A tropical court with a flair for the dramatic.",
  environmentLabel: "Tropical pixel-art courtroom",
  palette: { canvas: "#edf0df", paper: "#fffbed", panel: "#dce7c6", ink: "#244735", muted: "#647261", border: "#ccd4bb", accent: "#f6be5e", accentInk: "#244735", secondary: "#315f3c", header: "#fffdf1" },
  assets: { background: "jungle", bench: "jungle" },
  players: { defaults: { A: "jungle-lion", B: "jungle-zebra" }, characters: {
    "jungle-lion": { id: "jungle-lion", displayName: "Leo", roleLabel: "Lion", assetId: "lion", description: "Leo, a confident golden lion wearing a turquoise neckerchief" },
    "jungle-zebra": { id: "jungle-zebra", displayName: "Zuri", roleLabel: "Zebra", assetId: "zebra", description: "Zuri, an energetic zebra wearing a coral vest" },
  } },
  judge: { id: "jungle-moki", displayName: "Judge Moki", assetId: "lemur", description: "Judge Moki, a ring-tailed lemur in a judicial robe holding a gavel", personality: "Energetic, playful, dramatic and humorous. Expressive without taking sides.", dialogueStyle: "Warm, lively phrasing and light jungle metaphors. Humor never substitutes for evidence.", neutralityPolicy,
    dialogue: { welcome: "Welcome to the jungle! Create a private room or join your friend. I’ll keep your seats warm.", lobby: "Welcome to your private courtroom! Invite your friend, then each choose ready when you’re settled.", ready: "Both players are ready! Your jungle party is assembled. The debate will begin in a future stage." },
    samples: [
      { id: "welcome", label: "Welcome to court", text: "Order in the jungle! Big opinions welcome. Keep it kind, keep it convincing." },
      { id: "evidence", label: "A little encouragement", text: "An interesting point! A strong argument needs more than a very confident roar." },
      { id: "perspective", label: "A question for both sides", text: "Let’s peel this back. What’s one thing the other side might be right about?" },
    ],
  },
  animations: { idle: { durationMs: 2600, distancePx: 1 }, speaking: { durationMs: 480 }, objection: { style: "leaf-burst", implemented: false }, verdict: { style: "sunrise-panel", implemented: false } },
  ui: { lobbyTitle: "Your jungle party", seatLabel: "YOUR SEAT IN THE JUNGLE", tagline: "DIFFERENT VIEWS. SAME JUNGLE.", benchCaption: "THE JUNGLE COURT", speechBubble: "pixel-paper", buttonStyle: "pixel", font: "pixelify" },
};
