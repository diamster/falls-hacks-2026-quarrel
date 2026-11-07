import { neutralityPolicy, type ThemeConfig } from "./types";

export const detective: ThemeConfig = {
  id: "detective", displayName: "Detective", description: "Two stories. One rainy night. Follow the evidence in a monochrome detective office.",
  environmentLabel: "Film noir pixel-art detective office",
  palette: { canvas: "#d0d0d0", paper: "#e8e8e8", panel: "#cccccc", ink: "#272727", muted: "#555555", border: "#8b8b8b", accent: "#f3f3f3", accentInk: "#252525", secondary: "#444444", header: "#e0e0e0" },
  assets: { background: "detective", bench: "detective" },
  players: { defaults: { A: "detective-reporter", B: "detective-witness" }, characters: {
    "detective-reporter": { id: "detective-reporter", displayName: "Quinn", roleLabel: "Reporter", assetId: "detective-reporter", description: "Quinn, a monochrome newspaper reporter with a notebook" },
    "detective-witness": { id: "detective-witness", displayName: "Ellis", roleLabel: "Witness", assetId: "detective-witness", description: "Ellis, a monochrome witness in a waistcoat" },
  } },
  lawyers: {
    A: { id: "detective-marlow", displayName: "Marlow", assetId: "detective-lawyer-a", description: "Marlow, an original monochrome attorney in a pinstriped suit holding a case folder", personality: "Observant, economical and quietly reassuring. A precise advocate with dry humor.", dialogueStyle: "Short noir-style sentences that distinguish the player's stated reasons from speculation." },
    B: { id: "detective-arden", displayName: "Arden", assetId: "detective-lawyer-b", description: "Arden, an original monochrome attorney with round spectacles, a light coat and a dossier", personality: "Patient, perceptive and methodical. A thoughtful advocate who finds a clear thread in their player's argument.", dialogueStyle: "Measured detective-office phrasing with restrained asides; never manufacture a clue or allegation." },
  },
  jury: { id: "detective-night-jury", displayName: "The Night Panel", assetId: "detective-jury", description: "Three original monochrome jurors with distinct hairstyles seated behind a dark case-review desk", personality: "Skeptical, observant and impartial. The panel separates supported reasoning from atmosphere.", dialogueStyle: "Concise case-review language and explicit uncertainty; a hunch is never evidence.", neutralityPolicy },
  judge: { id: "detective-vale", displayName: "Detective Vale", assetId: "detective-vale", description: "Detective Vale, a monochrome investigator wearing a trench coat and fedora", personality: "Observant, skeptical and quietly mysterious, with dry humor. Questions claims equally on both sides.", dialogueStyle: "Measured noir phrasing, short observations and occasional dry asides. Suspicion is never proof.", neutralityPolicy,
    dialogue: { welcome: "Rain on the window. Two chairs by the desk. Bring a partner; we’ll hear both stories.", lobby: "The office is yours for the evening. Invite your partner and let me know when you’re ready.", ready: "Two seats filled. Agree on the question and both accounts, then Player A may open the case." },
    debateDialogue: {
      setup: "A case begins with a question. Player A, put the topic and both positions on the record.",
      awaitingApproval: "Two accounts, one case file. Player B, check the proposed terms before the clock starts.",
      introduction: "Welcome, {playerA} and {playerB}. The case before us: “{topic}” {speaker}, give your opening account. Both statements stay sealed until this round ends.",
      opening: "Opening accounts. {speaker}, tell your story. Both statements remain sealed until the round is complete.",
      rebuttal: "The first accounts are in. {speaker}, examine the other argument. A hunch still needs a reason.",
      questions: "One last detail in the case. {speaker}, help fill the gap by answering the clarification question.",
      complete: "Three rounds in the file. Read the record at your leisure. No winner is named and no AI verdict has been made.",
    },
    samples: [
      { id: "welcome", label: "An evening appointment", text: "Come in. The rain has an alibi. I’m more interested in yours." },
      { id: "evidence", label: "Separate fact from hunch", text: "A neat story. Let’s separate what we know from what merely looks convincing in low light." },
      { id: "perspective", label: "Hear the other account", text: "Two accounts, one room. What detail might the other side have noticed that you missed?" },
    ],
  },
  animations: { idle: { durationMs: 3400, distancePx: 1 }, speaking: { durationMs: 620 }, objection: { style: "typewriter-stamp", implemented: false }, verdict: { style: "case-file-panel", implemented: false } },
  ui: { lobbyTitle: "Your evening appointment", seatLabel: "TAKE A CHAIR", tagline: "TWO ACCOUNTS. ONE FAIR HEARING.", benchCaption: "THE NIGHT OFFICE", speechBubble: "noir-note", buttonStyle: "pixel", font: "pixelify" },
};
