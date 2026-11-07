import { neutralityPolicy, type ThemeConfig } from "./types";

export const superhero: ThemeConfig = {
  id: "superhero", displayName: "Superhero", description: "Take your case above the city. Moonlit rooftops, bright signals and sharp thinking.",
  environmentLabel: "Gothic superhero pixel-art rooftop",
  palette: { canvas: "#121c2e", paper: "#1d2c42", panel: "#293e55", ink: "#f2efdb", muted: "#bdcdd6", border: "#587186", accent: "#f7ca67", accentInk: "#18273a", secondary: "#56d4c6", header: "#172136" },
  assets: { background: "superhero", bench: "superhero" },
  players: { defaults: { A: "superhero-scout", B: "superhero-inventor" }, characters: {
    "superhero-scout": { id: "superhero-scout", displayName: "Nova", roleLabel: "Scout", assetId: "superhero-scout", description: "Nova, an original rooftop scout in a turquoise suit and coral cape" },
    "superhero-inventor": { id: "superhero-inventor", displayName: "Kit", roleLabel: "Inventor", assetId: "superhero-inventor", description: "Kit, an original violet-clad inventor with goggles" },
  } },
  lawyers: {
    A: { id: "superhero-aster", displayName: "Aster", assetId: "superhero-lawyer-a", description: "Aster, an original city advocate with gold spectacles, a teal cape and a case tablet", personality: "Witty, focused and resourceful. A confident sidekick who puts their player's reasoning in order.", dialogueStyle: "Crisp, heroic sentences with light investigation language; no invented deductions or facts." },
    B: { id: "superhero-vesper", displayName: "Vesper", assetId: "superhero-lawyer-b", description: "Vesper, an original rooftop advocate in violet with a cyan visor and a gold dossier", personality: "Inventive, composed and sharp. An encouraging advocate who makes the player's existing point easy to follow.", dialogueStyle: "Concise comic-book cadence and occasional dry wit, preserving the substance and limits of the submitted argument." },
  },
  jury: { id: "superhero-signal-jury", displayName: "The Signal Council", assetId: "superhero-jury", description: "Three original city jurors in teal, gold and violet seated at an illuminated rooftop desk", personality: "Analytical, steady and civic-minded. Every side receives the same scrutiny.", dialogueStyle: "Clear investigative reasoning with understated heroic language; presentation never determines the outcome.", neutralityPolicy },
  judge: { id: "superhero-rook", displayName: "Rook", assetId: "superhero-rook", description: "Rook, an original heroic sidekick in teal and gold", personality: "Witty, confident, heroic and analytical. A resourceful sidekick who gives both sides a fair hearing.", dialogueStyle: "Crisp comic-book phrasing with light detective and crime-fighting language. No copied character catchphrases.", neutralityPolicy,
    dialogue: { welcome: "The city’s listening. Assemble your duo and bring your sharpest ideas to the rooftop.", lobby: "Your rooftop headquarters is ready. Signal your partner, then tell me when you’re both set.", ready: "Both signals are green. Agree on the topic and positions, then Player A can launch the hearing." },
    debateDialogue: {
      setup: "Every mission needs a brief. Player A, set the question and the two opposing positions.",
      awaitingApproval: "Mission brief received. Player B, approve both positions or signal what needs changing.",
      introduction: "Welcome, {playerA} and {playerB}! Tonight’s mission: “{topic}” {speaker}, send your opening signal. Both openings stay sealed until this round ends.",
      opening: "First signal: opening statements. {speaker}, make your case. Both openings are sealed until the round ends.",
      rebuttal: "Time to inspect the other angle. {speaker}, your rebuttal is on the rooftop frequency.",
      questions: "Final checkpoint. {speaker}, let’s investigate your reasoning with a clarification question.",
      complete: "Mission logged: three rounds complete. The record is ready to review; no winner or AI verdict is assigned.",
    },
    samples: [
      { id: "welcome", label: "Rooftop roll call", text: "Welcome to the rooftop. Capes optional. Clear reasoning essential." },
      { id: "evidence", label: "Follow the evidence", text: "Bold theory. Now show me the evidence that makes it more than a great entrance." },
      { id: "perspective", label: "Check both angles", text: "Every skyline has two sides. What does the other perspective help us see?" },
    ],
  },
  animations: { idle: { durationMs: 2800, distancePx: 1 }, speaking: { durationMs: 500 }, objection: { style: "comic-flash", implemented: false }, verdict: { style: "signal-panel", implemented: false } },
  ui: { lobbyTitle: "Your rooftop duo", seatLabel: "A SEAT ABOVE THE CITY", tagline: "DIFFERENT VIEWS. SHARED SIGNAL.", benchCaption: "ROOFTOP HEADQUARTERS", speechBubble: "comic-panel", buttonStyle: "pixel", font: "pixelify" },
};
