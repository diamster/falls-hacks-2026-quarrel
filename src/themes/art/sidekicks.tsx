import { useId, type ComponentType } from "react";

/** Original one-pixel construction, rendered at the cast's existing two-unit grid. */
type Colors = { ink: string; suit: string; edge: string; accent: string; paper: string; skin: string; light: string; shade: string; hair: string; hairLight: string };
const courtA: Colors = { ink: "#302d35", suit: "#304b62", edge: "#658598", accent: "#d6aa5d", paper: "#fff0d4", skin: "#d6a17c", light: "#f2c8a0", shade: "#a56d53", hair: "#62697a", hairLight: "#bac1c3" };
const courtB: Colors = { ink: "#332c35", suit: "#784760", edge: "#b77a8e", accent: "#e2bc79", paper: "#fff0d8", skin: "#a66d4f", light: "#d39870", shade: "#744636", hair: "#322832", hairLight: "#62434a" };
const heroA: Colors = { ink: "#182b3d", suit: "#296875", edge: "#59b5b1", accent: "#f1c365", paper: "#f7eacb", skin: "#d4966b", light: "#f2c397", shade: "#9a614e", hair: "#243446", hairLight: "#486175" };
const heroB: Colors = { ink: "#21273b", suit: "#62518f", edge: "#9d84c3", accent: "#74d6cf", paper: "#f0e6c9", skin: "#9d674f", light: "#c8916f", shade: "#694336", hair: "#2e2847", hairLight: "#645175" };
const noirA: Colors = { ink: "#232323", suit: "#424242", edge: "#777777", accent: "#bcbcbc", paper: "#f0f0f0", skin: "#b6b6b6", light: "#dedede", shade: "#848484", hair: "#383838", hairLight: "#686868" };
const noirB: Colors = { ink: "#242424", suit: "#a7a7a7", edge: "#d4d4d4", accent: "#585858", paper: "#f2f2f2", skin: "#9d9d9d", light: "#c9c9c9", shade: "#707070", hair: "#303030", hairLight: "#5e5e5e" };
const toucan: Colors = { ink: "#243f35", suit: "#36705a", edge: "#65a17e", accent: "#e8ae54", paper: "#fff0c9", skin: "#35494a", light: "#58716b", shade: "#263b3c", hair: "#293e40", hairLight: "#58746d" };
const capybara: Colors = { ink: "#354239", suit: "#307e80", edge: "#72b8a5", accent: "#de9269", paper: "#fff0cf", skin: "#ac7850", light: "#d8a273", shade: "#79553b", hair: "#79553b", hairLight: "#c49564" };

function Casebook({ p, digital = false }: { p: Colors; digital?: boolean }) {
  return <>
    <path d="M32 34H44V50H32Z" fill={p.ink}/><path d="M34 35H43V48H34Z" fill={p.accent}/>
    <path d="M35 37H41V45H35Z" fill={digital ? p.edge : p.paper}/>
    <path d="M36 39H40V40H36ZM36 42H39V43H36Z" fill={p.ink}/>
    <path d="M33 35H35V48H33Z" fill={p.suit}/><path d="M35 48H43V49H35Z" fill={p.paper}/>
  </>;
}

function CounselSuit({ p, striped = false, digital = false }: { p: Colors; striped?: boolean; digital?: boolean }) {
  return <>
    <path d="M16 41H23V53H21V55H12V52H15ZM27 41H34V51H37V55H27Z" fill={p.ink}/>
    <path d="M17 43H21V51H17ZM29 43H32V52H29Z" fill={p.suit}/><path d="M14 53H21V54H14ZM29 53H35V54H29Z" fill={p.edge}/>
    <path d="M16 27H31V29H35V32H37V44H33V48H15V45H12V32H14V29H16Z" fill={p.ink}/>
    <path d="M16 29H31V31H33V44H30V46H17V43H15V32H16Z" fill={p.suit}/>
    <path d="M17 30H20V43H17ZM30 32H32V43H30Z" fill={p.edge}/>
    {striped && <path d="M16 34H17V43H16ZM19 36H20V44H19ZM28 36H29V44H28ZM31 34H32V43H31Z" fill={p.paper} opacity=".4"/>}
    <path d="M20 27H28V30H30V32H27V35H22V32H19V30H20Z" fill={p.paper}/>
    <path d="M23 31H26V34H25V40H23V34H22V32H23Z" fill={p.accent}/>
    <path d="M18 30H20V33H23V38H21V35H19V33H18ZM29 30H31V33H29V35H27V38H25V35H27V33H29Z" fill={p.edge}/>
    <path d="M13 31H17V35H15V42H11V46H7V41H9V35H11V32H13Z" fill={p.ink}/>
    <path d="M12 34H15V37H13V42H10V43H9V41H11V37H12Z" fill={p.suit}/>
    <path d="M8 43H12V45H14V49H9V48H7V45H8Z" fill={p.skin}/><path d="M9 44H11V46H9Z" fill={p.light}/>
    <path d="M31 30H35V33H39V40H35V37H32Z" fill={p.suit}/>
    <Casebook p={p} digital={digital}/>
    <path d="M31 40H35V42H37V45H33V44H31Z" fill={p.skin}/><path d="M32 40H35V42H32Z" fill={p.light}/>
    <path d="M23 41H25V43H23Z" fill={p.accent}/>
  </>;
}

function HumanHead({ p, curls = false, glasses = false }: { p: Colors; curls?: boolean; glasses?: boolean }) {
  return <>
    <path d="M16 8H20V6H29V8H32V12H34V21H32V25H29V28H20V26H16V23H14V13H16Z" fill={p.shade}/>
    <path d="M17 10H21V8H28V10H31V14H32V21H30V24H27V26H21V24H18V21H16V14H17Z" fill={p.skin}/>
    <path d="M19 12H23V10H28V13H30V20H28V22H20V20H18V14H19Z" fill={p.light}/>
    <path d="M13 17H16V22H13ZM32 17H35V21H32Z" fill={p.skin}/>
    <path d="M18 16H23V20H18ZM26 16H31V20H26Z" fill={p.paper}/>
    <path d="M20 16H23V20H20ZM26 16H29V20H26Z" fill={p.ink}/>
    <path d="M20 16H21V17H20ZM26 16H27V17H26Z" fill="#ffffff"/>
    <path d="M24 19H26V22H27V23H24Z" fill={p.shade}/>
    <g className="sprite-mouth"><path d="M21 24H28V26H23V25H21Z" fill={p.ink}/><path d="M22 24H27V25H22Z" fill={p.paper}/></g>
    {curls ? <>
      <path d="M14 18H12V11H14V7H17V4H21V3H25V4H29V3H32V6H35V10H36V16H33V13H30V11H27V12H23V10H20V12H17V18Z" fill={p.hair}/>
      <path d="M16 9H18V6H21V5H24V7H21V9H18V12H15V11H16ZM27 6H30V5H32V8H34V11H31V9H28Z" fill={p.hairLight}/>
    </> : <>
      <path d="M14 17V10H16V6H20V3H28V4H32V7H34V15H31V12H27V10H22V8H20V11H17V17Z" fill={p.hair}/>
      <path d="M17 8H20V6H25V5H29V7H31V9H26V8H22V7H20V9H17V12H15V10H17Z" fill={p.hairLight}/>
    </>}
    {glasses && <><path d="M16 15H24V16H26V15H33V21H26V18H24V21H16Z" fill={p.accent}/><path d="M18 17H22V19H18ZM28 17H31V19H28Z" fill={p.paper}/><path d="M20 17H22V19H20ZM28 17H30V19H28Z" fill={p.ink}/></>}
  </>;
}

function Cape({ p }: { p: Colors }) {
  return <><path d="M13 27H33V31H36V40H39V53H29V49H20V53H7V48H10V36H13Z" fill={p.ink}/><path d="M14 29H31V33H33V42H35V50H29V46H20V50H10V46H12V36H14Z" fill={p.edge}/><path d="M14 33H17V46H13V48H11V44H13Z" fill={p.accent}/></>;
}

function ToucanCounsel() {
  return <>
    <CounselSuit p={toucan}/>
    <path d="M16 7H26V9H30V13H32V22H29V26H26V29H18V27H14V23H12V13H14V9H16Z" fill="#253d3e"/>
    <path d="M16 11H25V13H27V23H24V27H18V25H15V21H14V15H16Z" fill="#fff0c4"/>
    <path d="M17 14H23V20H17Z" fill="#ffffff"/><path d="M20 14H23V20H20Z" fill="#24383d"/><path d="M20 14H21V16H20Z" fill="#ffffff"/>
    <path d="M25 13H35V15H39V18H42V23H39V25H30V23H25Z" fill="#754b35"/>
    <path d="M26 14H34V16H38V19H40V22H37V23H30V21H26Z" fill="#eca54b"/>
    <path d="M27 15H34V17H37V19H28Z" fill="#ffda70"/><path d="M38 19H40V22H37V23H34V21H38Z" fill="#df7750"/>
    <g className="sprite-mouth"><path d="M26 21H34V22H26Z" fill="#4f4537"/></g>
    <path d="M16 8H25V10H17V12H14V11H16Z" fill="#52736a"/>
  </>;
}

function CapybaraCounsel() {
  return <>
    <CounselSuit p={capybara}/>
    <path d="M13 10H17V8H21V10H29V8H33V11H36V23H33V27H29V29H18V27H13V23H11V13H13Z" fill={capybara.shade}/>
    <path d="M14 13H19V11H29V12H33V15H34V22H31V25H28V27H19V25H15V22H13V16H14Z" fill={capybara.skin}/>
    <path d="M16 13H20V12H29V14H31V20H28V22H18V20H15V16H16Z" fill={capybara.light}/>
    <path d="M14 10H17V13H14ZM30 10H33V13H30Z" fill="#d49a72"/>
    <path d="M16 17H20V20H16ZM28 17H32V20H28Z" fill="#333e35"/><path d="M16 17H17V18H16ZM28 17H29V18H28Z" fill="#fff1cc"/>
    <path d="M18 20H29V22H31V25H28V27H20V25H17V22H18Z" fill="#e6bb89"/>
    <path d="M22 21H26V23H22Z" fill="#6e503d"/><g className="sprite-mouth"><path d="M20 25H23V24H25V25H28V26H20Z" fill="#79553b"/></g>
    <path d="M16 15H20V16H16ZM28 15H32V16H28Z" fill="#79553b"/>
  </>;
}

function HeroCounselA() { return <><Cape p={heroA}/><CounselSuit p={heroA} digital/><HumanHead p={heroA} glasses/><path d="M18 29H21V31H18ZM29 29H32V31H29Z" fill={heroA.accent}/></>; }
function HeroCounselB() { return <><Cape p={heroB}/><CounselSuit p={heroB} digital/><HumanHead p={heroB} curls/><path d="M15 15H33V20H30V21H18V20H15Z" fill="#29596f"/><path d="M17 16H31V18H17Z" fill="#93e7d9"/><path d="M18 16H21V17H18Z" fill="#e4fff3"/></>; }
function NoirCounselA() { return <><CounselSuit p={noirA} striped/><HumanHead p={noirA}/><path d="M27 33H30V35H27Z" fill="#e2e2e2"/></>; }
function NoirCounselB() { return <><path d="M15 12H33V30H29V27H17V29H13V17H15Z" fill={noirB.hair}/><CounselSuit p={noirB}/><HumanHead p={noirB} curls glasses/><path d="M14 31H17V44H14ZM30 31H33V36H30Z" fill="#cfcfcf"/></>; }
function CourtCounselA() { return <><CounselSuit p={courtA}/><HumanHead p={courtA}/><path d="M28 33H31V35H28Z" fill={courtA.accent}/></>; }
function CourtCounselB() { return <><CounselSuit p={courtB}/><HumanHead p={courtB} curls/><path d="M29 33H31V36H29Z" fill={courtB.accent}/></>; }

function JurorBust({ p, variant }: { p: Colors; variant: number }) {
  return <>
    <path d="M3 20H7V18H17V20H21V24H23V34H1V25H3Z" fill={p.ink}/><path d="M5 21H9V20H16V22H19V32H4V25H5Z" fill={p.suit}/>
    <path d="M9 19H15V22H13V27H11V23H9Z" fill={p.paper}/><path d="M11 23H13V29H11Z" fill={p.accent}/>
    <path d="M6 5H9V3H16V5H19V10H20V15H18V19H15V21H9V19H6V16H4V9H6Z" fill={p.shade}/>
    <path d="M7 6H10V5H15V7H17V11H18V15H16V18H14V19H10V18H7V15H6V10H7Z" fill={p.skin}/>
    <path d="M8 8H15V10H16V14H14V16H9V14H7V11H8Z" fill={p.light}/>
    <path d="M7 11H11V14H7ZM14 11H18V14H14Z" fill={p.paper}/><path d="M9 11H11V14H9ZM14 11H16V14H14Z" fill={p.ink}/>
    <path d="M11 14H13V16H11Z" fill={p.shade}/><g className="sprite-mouth"><path d="M9 18H15V19H9Z" fill={p.ink}/></g>
    {variant === 0 ? <><path d="M5 10V5H8V2H15V3H18V5H20V10H17V7H13V6H10V7H7V10Z" fill={p.hair}/><path d="M7 5H10V4H15V5H17V6H12V5H9V7H7Z" fill={p.hairLight}/></>
      : variant === 1 ? <><path d="M5 12H3V7H5V4H8V1H12V2H15V1H18V4H21V8H20V13H17V9H14V8H11V9H8V12Z" fill={p.hair}/><path d="M6 6H8V4H11V3H13V5H10V6H8V9H5V8H6Z" fill={p.hairLight}/></>
        : <><path d="M5 10V5H8V3H16V5H19V10H17V7H8V10Z" fill={p.hair}/><path d="M5 12H11V13H14V12H20V16H14V14H11V16H5Z" fill={p.hair}/><path d="M6 13H9V15H6ZM15 13H18V15H15Z" fill={p.paper}/></>}
    <path d="M3 30H8V33H3ZM17 30H22V33H17Z" fill={p.skin}/>
  </>;
}

function AnimalJuror({ kind }: { kind: "tortoise" | "parrot" | "otter" }) {
  if (kind === "parrot") return <>
    <path d="M5 17H19V21H22V34H2V23H5Z" fill="#447b64"/><path d="M8 20H16V32H8Z" fill="#f4d58b"/>
    <path d="M7 3H15V5H18V9H19V15H16V19H9V17H6V14H4V8H7Z" fill="#b95140"/><path d="M8 5H15V8H17V14H14V17H9V15H7V9H8Z" fill="#e98958"/>
    <path d="M8 8H13V13H8Z" fill="#fff0ce"/><path d="M10 9H13V12H10Z" fill="#263f3b"/><path d="M14 10H20V12H22V16H18V18H15Z" fill="#e4b65a"/>
    <g className="sprite-mouth"><path d="M15 15H21V16H15Z" fill="#795334"/></g>
  </>;
  const shell = kind === "tortoise";
  return <>
    <path d="M5 19H19V22H22V34H2V24H5Z" fill={shell ? "#45654a" : "#4d7e80"}/><path d="M8 21H16V32H8Z" fill="#f4dca1"/>
    <path d="M6 5H9V3H16V5H19V10H20V16H17V20H9V18H5V15H4V9H6Z" fill={shell ? "#6c8650" : "#74553c"}/>
    <path d="M7 7H16V9H18V15H15V18H9V16H6V10H7Z" fill={shell ? "#b3bf78" : "#bf9567"}/>
    <path d="M7 10H11V13H7ZM14 10H18V13H14Z" fill="#fff1ce"/><path d="M9 10H11V13H9ZM14 10H16V13H14Z" fill="#304337"/>
    <path d="M10 14H16V17H10Z" fill={shell ? "#d2d494" : "#ead0a1"}/><path d="M12 14H15V15H12Z" fill="#544b37"/>
    <g className="sprite-mouth"><path d="M11 17H15V18H11Z" fill="#544b37"/></g>
    <path d="M8 18H11V20H15V18H18V22H8Z" fill="#dba756"/>
  </>;
}

type JuryStyle = { ink: string; wood: string; light: string; accent: string; people: Colors[]; animals?: boolean };
function JuryBox({ p }: { p: JuryStyle }) {
  return <>
    {[6, 36, 66].map((x, index) => <g key={x} transform={`translate(${x} 4)`}>
      <path d="M0 8H24V36H0Z" fill={p.ink}/><path d="M2 10H22V33H2Z" fill={p.wood}/><path d="M3 11H5V31H3Z" fill={p.light}/>
      {p.animals ? <AnimalJuror kind={(["tortoise", "parrot", "otter"] as const)[index]}/> : <JurorBust p={p.people[index]} variant={index}/>}
    </g>)}
    <path d="M2 35H94V39H92V53H89V55H7V53H4V39H2Z" fill={p.ink}/>
    <path d="M4 36H92V38H4Z" fill={p.light}/><path d="M6 39H90V52H6Z" fill={p.wood}/>
    <path d="M8 40H10V50H8ZM34 40H36V50H34ZM61 40H63V50H61ZM87 40H89V50H87Z" fill={p.light}/>
    <path d="M12 41H31V48H12ZM38 41H59V48H38ZM65 41H84V48H65Z" fill={p.ink} opacity=".25"/>
    <path d="M42 41H54V48H42Z" fill={p.ink}/><path d="M44 42H52V47H44Z" fill={p.accent}/>
    <path d="M7 52H89V53H7Z" fill={p.light}/>
  </>;
}

const sidekickArt: Record<string, { draw: ComponentType; jury?: boolean }> = {
  "jungle-lawyer-a": { draw: ToucanCounsel }, "jungle-lawyer-b": { draw: CapybaraCounsel },
  "superhero-lawyer-a": { draw: HeroCounselA }, "superhero-lawyer-b": { draw: HeroCounselB },
  "detective-lawyer-a": { draw: NoirCounselA }, "detective-lawyer-b": { draw: NoirCounselB },
  "courtroom-lawyer-a": { draw: CourtCounselA }, "courtroom-lawyer-b": { draw: CourtCounselB },
  "jungle-jury": { jury: true, draw: () => <JuryBox p={{ ink: "#4b4433", wood: "#a67946", light: "#dbb66f", accent: "#7eb597", people: [], animals: true }}/> },
  "superhero-jury": { jury: true, draw: () => <JuryBox p={{ ink: "#1b2a3e", wood: "#345367", light: "#69b7b7", accent: "#efc56c", people: [heroA, heroB, { ...heroA, skin: "#bf8a65", light: "#e3b68b", hair: "#b4b8bd", hairLight: "#e3e7de" }] }}/> },
  "detective-jury": { jury: true, draw: () => <JuryBox p={{ ink: "#272727", wood: "#696969", light: "#a4a4a4", accent: "#d0d0d0", people: [noirA, noirB, { ...noirA, hair: "#929292", hairLight: "#c8c8c8" }] }}/> },
  "courtroom-jury": { jury: true, draw: () => <JuryBox p={{ ink: "#4b352c", wood: "#9e7046", light: "#d7ad71", accent: "#e5c579", people: [courtA, courtB, { ...courtA, suit: "#62715b", edge: "#98a58a", hair: "#674334", hairLight: "#ac7a51" }] }}/> },
};

export const sidekickAssetIds: readonly string[] = Object.freeze(Object.keys(sidekickArt));

export function SidekickSprite({ assetId, label, className = "" }: { assetId: string; label: string; className?: string }) {
  const id = useId();
  const asset = Object.hasOwn(sidekickArt, assetId) ? sidekickArt[assetId] : sidekickArt["courtroom-lawyer-a"];
  const Draw = asset.draw;
  return <svg className={className} viewBox={asset.jury ? "0 0 192 112" : "0 0 96 112"} fill="none" shapeRendering="crispEdges" role="img" aria-labelledby={id} data-character-asset={assetId}>
    <title id={id}>{label}</title>
    <g className="sprite-body"><g transform="scale(2)"><Draw/></g></g>
  </svg>;
}
