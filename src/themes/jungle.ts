import { neutralityPolicy, type ThemeConfig } from "./types";
import { mascots } from "./art/pixel/mascots";
import { mascotAssetId, mascotLawyers } from "./art/pixel/roster";

export const jungle: ThemeConfig = {
  id: "jungle", displayName: "Jungle", description: "Big opinions beneath the palms. A tropical court with a flair for the dramatic.",
  environmentLabel: "Tropical pixel-art courtroom",
  palette: { canvas: "#edf0df", paper: "#fffbed", panel: "#dce7c6", ink: "#244735", muted: "#647261", border: "#ccd4bb", accent: "#f6be5e", accentInk: "#244735", secondary: "#315f3c", header: "#fffdf1" },
  assets: { background: "jungle", bench: "jungle" },
  players: { defaults: { A: "jungle-lion", B: "jungle-zebra" }, characters: {
    "jungle-lion": { id: "jungle-lion", displayName: "Leo", roleLabel: "Lion", assetId: "lion", description: "Leo, a confident golden lion wearing a turquoise neckerchief" },
    "jungle-zebra": { id: "jungle-zebra", displayName: "Zuri", roleLabel: "Zebra", assetId: "zebra", description: "Zuri, an energetic zebra wearing a coral vest" },
  } },
  lawyers: {
    A: { id: "jungle-tavi", displayName: "Tavi", assetId: mascotAssetId(mascotLawyers.A, "jungle"), description: `Tavi, drawn as ${mascots[mascotLawyers.A].description}`, personality: "Bright, curious and encouraging. A spirited advocate who helps their player express a clear point.", dialogueStyle: "Lively, concise phrasing and an occasional light jungle metaphor; preserve the player's actual meaning." },
    B: { id: "jungle-fern", displayName: "Fern", assetId: mascotAssetId(mascotLawyers.B, "jungle"), description: `Fern, drawn as ${mascots[mascotLawyers.B].description}`, personality: "Calm, good-humored and resourceful. A patient advocate who organizes their player's reasoning.", dialogueStyle: "Warm, grounded sentences with gentle humor, without adding claims or evidence." },
  },
  jury: { id: "jungle-canopy-jury", displayName: "The Canopy Jury", assetId: "jungle-jury", description: "Three original jungle jurors, a tortoise, parrot and otter, seated behind a wooden rail", personality: "Attentive, warm and fair-minded. The panel weighs both sides with equal care.", dialogueStyle: "Plain reasoning with restrained jungle imagery; uncertainty stays explicit and never becomes a joke.", neutralityPolicy },
  judge: { id: "jungle-moki", displayName: "Judge Moki", assetId: "lemur", description: "Judge Moki, a ring-tailed lemur in a judicial robe holding a gavel", personality: "Energetic, playful, dramatic and humorous. Expressive without taking sides.", dialogueStyle: "Warm, lively phrasing and light jungle metaphors. Humor never substitutes for evidence.", neutralityPolicy,
    dialogue: { welcome: "Welcome to the jungle! Create a private room or join your friend. I’ll keep your seats warm.", lobby: "Welcome to your private courtroom! Invite your friend, then each choose ready when you’re settled.", ready: "Both players are ready! Agree on your topic and positions, then Player A can open this jungle hearing." },
    debateDialogue: {
      setup: "Every good jungle debate needs a question! Player A, propose a topic and a clear position for each side.",
      awaitingApproval: "Two sides of the same banana! Player B, check the topic and positions before we begin.",
      introduction: "Welcome, {playerA} and {playerB}! The jungle question: “{topic}” {speaker}, plant your opening idea! Both openings stay private until this round ends.",
      opening: "Round one: plant your idea! {speaker} has the floor. Both openings stay private until this round ends.",
      rebuttal: "Round two: let’s peel back the arguments. {speaker}, respond to the other opening with care.",
      questions: "One final branch to explore! {speaker}, help us understand your reasoning by answering the clarification question.",
      complete: "And that’s our jungle hearing! All three rounds are complete. No winner or AI verdict is assigned in this stage.",
    },
    samples: [
      { id: "welcome", label: "Welcome to court", text: "Order in the jungle! Big opinions welcome. Keep it kind, keep it convincing." },
      { id: "evidence", label: "A little encouragement", text: "An interesting point! A strong argument needs more than a very confident roar." },
      { id: "perspective", label: "A question for both sides", text: "Let’s peel this back. What’s one thing the other side might be right about?" },
    ],
  },
  animations: { idle: { durationMs: 2600, distancePx: 1 }, speaking: { durationMs: 480 }, objection: { style: "leaf-burst", implemented: false }, verdict: { style: "sunrise-panel", implemented: false } },
  ui: { lobbyTitle: "Your jungle party", seatLabel: "YOUR SEAT IN THE JUNGLE", tagline: "DIFFERENT VIEWS. SAME JUNGLE.", benchCaption: "THE JUNGLE COURT", speechBubble: "pixel-paper", buttonStyle: "pixel", font: "pixelify" },
};
