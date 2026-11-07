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
  lawyers: {
    A: { id: "courtroom-emery", displayName: "Emery", assetId: "courtroom-lawyer-a", description: "Emery, an original silver-haired lawyer in a navy suit carrying a gold-edged lawbook", personality: "Composed, articulate and supportive. A respectful advocate who organizes their player's reasoning.", dialogueStyle: "Plain professional legal phrasing, with no invented precedent, claims or evidence." },
    B: { id: "courtroom-sage", displayName: "Sage", assetId: "courtroom-lawyer-b", description: "Sage, an original curly-haired lawyer in a plum blazer holding a cream document folder", personality: "Thoughtful, assured and meticulous. A patient advocate who states the player's own position precisely.", dialogueStyle: "Clear, courteous sentences that preserve qualification and distinguish a claim from its support." },
  },
  jury: { id: "courtroom-civic-jury", displayName: "The Civic Jury", assetId: "courtroom-jury", description: "Three original human jurors in varied formal attire seated behind an oak jury rail", personality: "Professional, attentive and impartial. The panel considers the complete public record using consistent criteria.", dialogueStyle: "Composed judicial language, concise reasons for both sides and explicit recognition of uncertainty.", neutralityPolicy },
  judge: { id: "courtroom-rowan", displayName: "Judge Rowan", assetId: "courtroom-rowan", description: "Judge Rowan, a composed human judge in a judicial robe", personality: "Serious, composed, professional and authoritative. Patient, impartial and respectful toward both speakers.", dialogueStyle: "Clear formal language and judicial terminology, with reasons stated plainly rather than theatrically.", neutralityPolicy,
    dialogue: { welcome: "Welcome to the court. Please create a room or join your fellow participant.", lobby: "Both parties may take their seats. Indicate your readiness once you are settled.", ready: "Both parties have confirmed readiness. Once the topic and positions are approved, Player A may begin proceedings." },
    debateDialogue: {
      setup: "Player A, please propose the question before the court and a position for each party.",
      awaitingApproval: "Player B, please review the proposed topic and positions. Confirm your agreement or request amendments.",
      introduction: "Welcome, {playerA} and {playerB}. The question before the court: “{topic}” {speaker}, please begin. Both openings remain private until this round concludes.",
      opening: "Opening statements. {speaker} has the floor. Both statements remain private until this round concludes.",
      rebuttal: "The court will now hear rebuttals. {speaker}, please address the other party’s opening argument.",
      questions: "Both positions are on the record. {speaker}, please clarify the point raised in your question.",
      complete: "All three rounds are concluded. The record is available below. No winner or AI verdict is determined in this stage.",
    },
    samples: [
      { id: "welcome", label: "Call to order", text: "This court will hear both perspectives with equal care. Please proceed with courtesy." },
      { id: "evidence", label: "Establish the basis", text: "Please distinguish your central claim from the evidence offered in its support." },
      { id: "perspective", label: "Consider both positions", text: "Before responding, identify the strongest point in the other party’s position." },
    ],
  },
  animations: { idle: { durationMs: 3200, distancePx: 1 }, speaking: { durationMs: 560 }, objection: { style: "gavel-stamp", implemented: false }, verdict: { style: "sealed-paper", implemented: false } },
  ui: { lobbyTitle: "Your court session", seatLabel: "PLEASE TAKE YOUR SEAT", tagline: "DIFFERENT VIEWS. EQUAL CONSIDERATION.", benchCaption: "A FAIR HEARING", speechBubble: "formal-paper", buttonStyle: "pixel", font: "pixelify" },
};
