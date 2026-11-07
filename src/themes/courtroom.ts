import { neutralityPolicy, type ThemeConfig } from "./types";

export const courtroom: ThemeConfig = {
  id: "courtroom", displayName: "Courtroom", description: "Warm wood, balanced scales and a composed judge. A classic setting for opposing views.",
  environmentLabel: "Traditional pixel-art courtroom",
  palette: { canvas: "#e7dcc6", paper: "#fff5df", panel: "#ead6b4", ink: "#3a302b", muted: "#6f5b4c", border: "#bc9e7a", accent: "#d9ad57", accentInk: "#352c26", secondary: "#51402f", header: "#fff3da" },
  assets: { background: "courtroom", bench: "courtroom" },
  players: { defaults: { A: "courtroom-advocate-a", B: "courtroom-advocate-b" }, characters: {
    "courtroom-advocate-a": { id: "courtroom-advocate-a", displayName: "Morgan", roleLabel: "Advocate", assetId: "courtroom-advocate-a", description: "Morgan, a courtroom advocate wearing a navy suit" },
    "courtroom-advocate-b": { id: "courtroom-advocate-b", displayName: "Casey", roleLabel: "Advocate", assetId: "courtroom-advocate-b", description: "Casey, a courtroom advocate wearing a burgundy suit" },
  } },
  judge: { id: "courtroom-rowan", displayName: "Judge Rowan", assetId: "courtroom-rowan", description: "Judge Rowan, a composed human judge in a judicial robe", personality: "Serious, composed, professional and authoritative. Patient, impartial and respectful toward both speakers.", dialogueStyle: "Clear formal language and judicial terminology, with reasons stated plainly rather than theatrically.", neutralityPolicy,
    dialogue: { welcome: "Welcome to the court. Please create a room or join your fellow participant.", lobby: "Both parties may take their seats. Indicate your readiness once you are settled.", ready: "Both parties have confirmed readiness. This lobby is prepared; proceedings begin in a future stage." },
    samples: [
      { id: "welcome", label: "Call to order", text: "This court will hear both perspectives with equal care. Please proceed with courtesy." },
      { id: "evidence", label: "Establish the basis", text: "Please distinguish your central claim from the evidence offered in its support." },
      { id: "perspective", label: "Consider both positions", text: "Before responding, identify the strongest point in the other party’s position." },
    ],
  },
  animations: { idle: { durationMs: 3200, distancePx: 1 }, speaking: { durationMs: 560 }, objection: { style: "gavel-stamp", implemented: false }, verdict: { style: "sealed-paper", implemented: false } },
  ui: { lobbyTitle: "Your court session", seatLabel: "PLEASE TAKE YOUR SEAT", tagline: "DIFFERENT VIEWS. EQUAL CONSIDERATION.", benchCaption: "A FAIR HEARING", speechBubble: "formal-paper", buttonStyle: "pixel", font: "pixelify" },
};
