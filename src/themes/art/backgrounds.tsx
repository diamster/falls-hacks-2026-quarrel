import { useId } from "react";

function CityBlock({ x, top, width, color, windows = "#dab674", spire = false }: { x: number; top: number; width: number; color: string; windows?: string; spire?: boolean }) {
  return <g>
    <path d={`M${x} ${top + 14}H${x + 8}V${top}H${x + width - 8}V${top + 14}H${x + width}V330H${x}Z`} fill={color}/>
    {spire && <><path d={`M${x + width / 2 - 4} ${top - 32}H${x + width / 2 + 4}V${top}H${x + width / 2 - 4}Z`} fill={color}/><path d={`M${x + 12} ${top - 8}H${x + width - 12}V${top + 4}H${x + 12}Z`} fill={color}/></>}
    {Array.from({length:Math.max(0,Math.floor((310-top)/24))},(_,row)=>Array.from({length:Math.floor((width-14)/16)},(_,col)=>
      <rect key={`${row}-${col}`} x={x+10+col*16} y={top+24+row*24} width={5} height={8} fill={windows} opacity={(row+col*2)%4===0 ? .65 : .22}/>
    ))}
    <path d={`M${x + 4} ${top + 18}H${x + 8}V326H${x + 4}Z`} fill="#8b9ca6" opacity=".16"/>
  </g>;
}

/** Rooftop scene: architectural shapes and a plain searchlight, no borrowed emblems. */
export function SuperheroBackground() {
  const id = useId().replace(/:/g, "");
  return <>
    <defs>
      <pattern id={`${id}-roof`} width="96" height="34" patternUnits="userSpaceOnUse"><path d="M0 0H96V34H0Z" fill="#4a5a6e"/><path d="M0 0H96V4H0ZM0 0H4V34H0Z" fill="#718093"/><path d="M0 30H96V34H0Z" fill="#2a364c"/><path d="M16 12H38V14H16ZM58 20H88V22H58Z" fill="#65748a"/></pattern>
    </defs>
    <path d="M0 0H960V440H0Z" fill="#172137"/>
    <path d="M0 108H960V202H0Z" fill="#263148"/>
    <path d="M0 202H960V344H0Z" fill="#3a475d"/>
    <path d="M664 30H692V36H706V50H712V76H706V90H692V96H664V90H650V76H644V50H650V36H664Z" fill="#d9dbc0"/>
    <path d="M664 38H678V46H670V58H662V72H656V56H660V46H664ZM694 78H702V84H694Z" fill="#aeb9b2"/>
    <path d="M78 32H82V36H78ZM208 62H212V66H208ZM342 30H346V34H342ZM420 72H424V76H420ZM562 36H566V40H562ZM812 54H816V58H812ZM894 30H898V34H894Z" fill="#b9d7d3"/>
    <path d="M104 90H130V84H156V88H184V96H206V102H82V96H104ZM760 114H790V108H826V114H848V120H866V126H736V120H760Z" fill="#56677a" opacity=".5"/>
    <path d="M0 156H36V132H62V146H94V112H126V158H164V134H188V148H216V114H238V158H262V130H294V108H324V152H350V122H380V142H404V112H426V160H454V130H486V146H510V106H536V136H558V152H582V120H612V138H638V110H668V150H698V128H726V152H752V104H784V130H808V148H838V116H866V156H898V134H928V148H960V328H0Z" fill="#39475c"/>
    <CityBlock x={10} top={146} width={94} color="#242f46"/>
    <CityBlock x={108} top={116} width={80} color="#26334b" spire/>
    <CityBlock x={200} top={174} width={82} color="#273850"/>
    <CityBlock x={290} top={126} width={92} color="#26364e" spire/>
    <CityBlock x={386} top={182} width={74} color="#293a50"/>
    <CityBlock x={468} top={154} width={72} color="#29384e"/>
    <CityBlock x={552} top={116} width={88} color="#25344c" spire/>
    <CityBlock x={646} top={178} width={70} color="#27374f"/>
    <CityBlock x={724} top={136} width={100} color="#243147" spire/>
    <CityBlock x={838} top={172} width={112} color="#233048"/>
    {/* A stepped shaft of light is recognizably pixel art at every viewport. */}
    <path d="M692 334H706V290H686V248H666V208H644V166H622V124H600V82H578V40H556V0H326V20H352V40H378V62H404V86H430V110H456V134H482V160H508V186H532V212H558V240H584V266H610V294H638V320H666V334Z" fill="#bfe4ce" opacity=".10"/>
    <path d="M0 302H960V340H0Z" fill="#202c42"/>
    <path d="M0 304H960V312H0Z" fill="#7a8a98"/>
    <path d="M0 312H960V318H0Z" fill="#3f5168"/>
    <path d="M0 334H960V440H0Z" fill={`url(#${id}-roof)`}/>
    <path d="M0 334H960V340H0Z" fill="#82909b"/>
    <path d="M0 424H960V440H0Z" fill="#25314a"/>
    <path d="M0 426H960V430H0Z" fill="#617589"/>
    <path d="M278 388H680V392H696V410H680V414H278V410H262V392H278Z" fill="#172539" opacity=".28"/>
    <g className="theme-scenery-wide">
      <path d="M62 262H146V268H152V332H56V268H62Z" fill="#27384e"/><path d="M64 266H142V274H64Z" fill="#617c89"/>
      <path d="M68 284H136V290H68ZM68 300H136V306H68ZM68 316H136V322H68Z" fill="#172638"/>
      <path d="M796 278H846V286H854V330H790V286H796Z" fill="#35485e"/>
      <path d="M802 282H842V286H802ZM796 290H802V320H796Z" fill="#718998"/>
      <path d="M814 292H826V298H814ZM838 306H844V316H838Z" fill="#e7c979"/>
      <path d="M854 220H860V328H854Z" fill="#253649"/><path d="M844 214H870V220H844Z" fill="#96b0b2"/>
      <path d="M854 192H860V204H854ZM830 204H838V210H830ZM876 204H884V210H876Z" fill="#f5cc76"/>
    </g>
    <path d="M684 300H708V308H714V328H678V310H684Z" fill="#182d40"/>
    <path d="M684 304H704V314H684Z" fill="#80b6b3"/><path d="M688 304H702V308H688Z" fill="#def3cf"/>
    <path d="M692 326H700V338H692ZM680 336H712V342H680Z" fill="#182d40"/>
    <path d="M308 318H326V322H308ZM610 318H628V322H610Z" fill="#5fd4be"/>
  </>;
}

function FilingCabinet({x,y}: {x:number;y:number}) {
  return <g transform={`translate(${x} ${y})`}>
    <path d="M0 0H80V126H0Z" fill="#333333"/><path d="M4 4H76V122H4Z" fill="#676767"/>
    {[8,44,80].map(top=><g key={top}><path d={`M8 ${top}H72V${top+30}H8Z`} fill="#494949"/><path d={`M12 ${top+4}H68V${top+8}H12Z`} fill="#878787"/><path d={`M28 ${top+12}H52V${top+20}H28Z`} fill="#adadad"/><path d={`M34 ${top+14}H46V${top+18}H34Z`} fill="#535353"/></g>)}
  </g>;
}

/** Noir office uses neutral grays only; window slats cast long stepped shadows. */
export function DetectiveBackground() {
  const id = useId().replace(/:/g, "");
  return <>
    <defs>
      <pattern id={`${id}-paper`} width="48" height="48" patternUnits="userSpaceOnUse"><path d="M0 0H48V48H0Z" fill="#757575"/><path d="M0 0H2V48H0ZM22 0H24V48H22Z" fill="#818181"/><path d="M10 12H12V14H10ZM34 32H36V34H34Z" fill="#696969"/></pattern>
      <pattern id={`${id}-floor`} width="128" height="24" patternUnits="userSpaceOnUse"><path d="M0 0H128V24H0Z" fill="#565656"/><path d="M0 0H128V3H0ZM0 0H3V24H0Z" fill="#323232"/><path d="M8 5H118V7H8ZM34 14H80V16H34Z" fill="#747474"/></pattern>
    </defs>
    <path d="M0 0H960V440H0Z" fill={`url(#${id}-paper)`}/>
    <path d="M0 0H960V22H0Z" fill="#303030"/><path d="M0 22H960V28H0Z" fill="#b1b1b1"/>
    <path d="M250 28H710V296H250Z" fill="#272727"/>
    <path d="M258 36H702V288H258Z" fill="#b7b7b7"/>
    <path d="M268 46H692V276H268Z" fill="#383838"/>
    <path d="M278 54H682V268H278Z" fill="#939393"/>
    <path d="M278 178H300V144H330V162H352V112H380V176H404V140H428V166H450V128H480V176H506V146H532V108H554V172H580V134H606V168H632V142H660V122H682V268H278Z" fill="#5e5e5e"/>
    <path d="M278 218H312V192H340V208H366V170H390V216H422V182H454V212H486V190H510V210H540V176H564V212H596V184H626V208H656V186H682V268H278Z" fill="#424242"/>
    {[294,338,382,426,470,514,558,602,646].map((x,i)=><path key={x} d={`M${x} ${64+i%3*10}H${x+2}V${80+i%3*10}H${x-2}V${94+i%3*10}H${x-4}V${98+i%3*10}H${x-6}V${84+i%3*10}H${x-2}V${70+i%3*10}H${x}Z`} fill="#dadada" opacity=".6"/>)}
    {[62,86,110,134,158,182,206,230].map(y=><g key={y}><path d={`M270 ${y}H690V${y+8}H270Z`} fill="#242424"/><path d={`M274 ${y+2}H686V${y+4}H274Z`} fill="#b5b5b5"/><path d={`M282 ${y+8}H678V${y+12}H282Z`} fill="#d5d5d5" opacity=".25"/></g>)}
    <path d="M472 46H486V276H472Z" fill="#303030"/><path d="M474 48H478V274H474Z" fill="#b5b5b5"/>
    <path d="M686 54H690V244H686ZM686 244H694V254H686Z" fill="#e1e1e1"/>
    <path d="M240 278H720V286H726V298H234V286H240Z" fill="#363636"/><path d="M240 280H720V286H240Z" fill="#d5d5d5"/>
    <path d="M0 304H960V332H0Z" fill="#333333"/><path d="M0 302H960V308H0Z" fill="#ababab"/>
    <path d="M0 330H960V440H0Z" fill={`url(#${id}-floor)`}/>
    <path d="M284 330H330L484 440H430ZM378 330H424L578 440H524ZM472 330H518L672 440H618ZM566 330H612L766 440H712Z" fill="#d4d4d4" opacity=".18"/>
    <path d="M0 420H960V440H0Z" fill="#292929"/><path d="M0 422H960V428H0Z" fill="#929292"/>
    <g className="theme-scenery-wide">
      <FilingCabinet x={80} y={204}/><FilingCabinet x={164} y={204}/>
      <path d="M96 100H224V184H96Z" fill="#292929"/><path d="M102 106H218V178H102Z" fill="#a9a9a9"/>
      <path d="M112 118H152V142H112ZM168 116H208V154H168ZM138 152H166V170H138Z" fill="#dddddd"/>
      <path d="M118 124H144V126H118ZM118 132H138V134H118ZM174 124H200V126H174ZM174 136H198V138H174ZM144 158H160V160H144Z" fill="#7b7b7b"/>
      <path d="M152 128H170V130H152ZM152 130H154V154H152ZM164 158H184V160H164V158Z" fill="#454545"/>
      <path d="M790 52H830V60H842V76H848V102H840V116H824V124H796V116H780V102H776V76H784V60H790Z" fill="#303030"/>
      <path d="M796 60H824V68H836V80H840V98H832V110H820V116H800V110H788V98H784V80H792V68H796Z" fill="#d4d4d4"/>
      <path d="M808 68H812V90H824V94H806V68Z" fill="#3a3a3a"/>
      <path d="M808 62H812V66H808ZM834 88H838V92H834ZM808 110H812V114H808ZM786 88H790V92H786Z" fill="#5b5b5b"/>
      <path d="M784 214H870V220H882V236H770V224H776V220H784Z" fill="#c4c4c4"/>
      <path d="M822 232H830V318H822ZM802 316H850V324H802Z" fill="#343434"/>
      <path d="M774 236H878V244H774Z" fill="#525252"/>
      <path d="M800 326H850V330H800Z" fill="#d5d5d5"/>
    </g>
    <path d="M282 310H336V320H282ZM624 310H676V320H624Z" fill="#b7b7b7" opacity=".45"/>
    <path d="M284 390H678V394H692V414H278V396H284Z" fill="#222222" opacity=".28"/>
  </>;
}

function CourtColumn({x}: {x:number}) {
  return <g>
    <path d={`M${x} 34H${x+68}V46H${x}ZM${x+6} 46H${x+62}V56H${x+6}ZM${x+14} 56H${x+54}V286H${x+14}ZM${x+6} 286H${x+62}V296H${x+6}ZM${x} 296H${x+68}V308H${x}Z`} fill="#a3754b"/>
    <path d={`M${x+4} 36H${x+64}V42H${x+4}ZM${x+18} 60H${x+24}V282H${x+18}ZM${x+34} 60H${x+40}V282H${x+34}ZM${x+8} 288H${x+58}V292H${x+8}ZM${x+4} 298H${x+64}V304H${x+4}Z`} fill="#dfba7d"/>
    <path d={`M${x+48} 60H${x+54}V284H${x+48}Z`} fill="#825738"/>
  </g>;
}

function Scales({x,y}: {x:number;y:number}) {
  return <g transform={`translate(${x} ${y})`}>
    <path d="M-4 0H4V72H-4ZM-36 16H36V22H-36ZM-44 68H44V74H-44ZM-26 74H26V80H-26Z" fill="#936734"/>
    <path d="M-2 2H2V68H-2ZM-34 16H34V18H-34ZM-42 68H42V70H-42Z" fill="#e5c487"/>
    <path d="M-30 22H-28V46H-30ZM28 22H30V46H28ZM-42 44H-16V50H-20V54H-38V50H-42ZM16 44H42V50H38V54H20V50H16Z" fill="#bc9355"/>
    <path d="M-38 46H-20V48H-38ZM20 46H38V48H20Z" fill="#f0d59c"/>
    <path d="M-6 2H6V10H-6Z" fill="#d0aa66"/>
  </g>;
}

export function CourtroomBackground() {
  const id = useId().replace(/:/g, "");
  return <>
    <defs>
      <pattern id={`${id}-panel`} width="120" height="140" patternUnits="userSpaceOnUse"><path d="M0 0H120V140H0Z" fill="#a7794d"/><path d="M4 4H116V136H4Z" fill="#765034"/><path d="M10 10H110V130H10Z" fill="#c08e58"/><path d="M16 16H104V124H16Z" fill="#94643d"/><path d="M16 16H104V20H16Z" fill="#d2a771"/><path d="M98 20H104V124H98Z" fill="#67482f"/></pattern>
      <pattern id={`${id}-floor`} width="120" height="30" patternUnits="userSpaceOnUse"><path d="M0 0H120V30H0Z" fill="#9c7048"/><path d="M0 0H120V4H0Z" fill="#cfa56d"/><path d="M0 27H120V30H0ZM0 4H3V27H0Z" fill="#674b36"/><path d="M12 14H48V16H12ZM80 8H110V10H80Z" fill="#b88b57"/></pattern>
    </defs>
    <path d="M0 0H960V440H0Z" fill="#e4d1a6"/>
    <path d="M0 0H960V20H0Z" fill="#573f30"/><path d="M0 20H960V30H0Z" fill="#ba8c56"/><path d="M0 30H960V36H0Z" fill="#f2d7a0"/>
    <path d="M0 170H960V318H0Z" fill={`url(#${id}-panel)`}/>
    <path d="M0 166H960V176H0Z" fill="#6f4b31"/><path d="M0 164H960V168H0Z" fill="#e9c48d"/>
    <path d="M286 170V100H302V76H326V54H354V42H606V54H634V76H658V100H674V170Z" fill="#624834"/>
    <path d="M300 170V106H314V82H338V64H360V54H600V64H622V82H646V106H660V170Z" fill="#c8a66b"/>
    <path d="M312 170V112H326V90H348V74H368V64H592V74H612V90H634V112H648V170Z" fill="#708582"/>
    <path d="M320 166V116H334V96H354V80H374V72H586V80H606V96H626V116H640V166Z" fill="#a9bab0"/>
    <path d="M472 66H488V170H472ZM320 126H640V136H320Z" fill="#e3c68e"/>
    <path d="M476 66H480V170H476ZM322 128H638V132H322Z" fill="#fff0be"/>
    <path d="M354 80H364V164H354ZM596 80H606V164H596Z" fill="#d8b67b"/>
    <path d="M322 154H640V170H322Z" fill="#829d96" opacity=".6"/>
    <CourtColumn x={204}/><CourtColumn x={688}/>
    <path d="M278 44H306V80H300V124H292V166H278Z" fill="#713c42"/><path d="M282 48H292V110H286V150H282Z" fill="#ac6262"/>
    <path d="M654 44H682V166H668V124H660V80H654Z" fill="#713c42"/><path d="M670 48H678V150H674V110H670Z" fill="#ac6262"/>
    <path d="M276 160H300V168H276ZM660 160H684V168H660Z" fill="#dbb476"/>
    <path d="M0 304H960V332H0Z" fill="#5e4230"/><path d="M0 304H960V310H0Z" fill="#d4ac72"/>
    <path d="M0 330H960V440H0Z" fill={`url(#${id}-floor)`}/>
    <path d="M0 420H960V440H0Z" fill="#604634"/><path d="M0 422H960V428H0Z" fill="#bd8c58"/>
    <path d="M308 326H652V334H668V346H292V334H308Z" fill="#523f32"/>
    <path d="M310 326H650V330H310ZM296 336H664V340H296Z" fill="#dec08b"/>
    <path d="M302 346H658V420H302Z" fill="#8b4e4b"/>
    <path d="M310 348H650V420H310Z" fill="#ad7063"/><path d="M316 348H320V420H316ZM640 348H644V420H640Z" fill="#d6b17b"/>
    <g className="theme-scenery-wide">
      <path d="M68 66H170V144H68Z" fill="#6f4c32"/><path d="M74 72H164V138H74Z" fill="#d0aa70"/><path d="M80 78H158V132H80Z" fill="#eadcb8"/>
      <path d="M106 90H132V94H106ZM94 102H144V106H94ZM96 112H142V116H96ZM108 122H132V126H108Z" fill="#a28b64"/>
      <path d="M786 66H888V144H786Z" fill="#6f4c32"/><path d="M792 72H882V138H792Z" fill="#d0aa70"/><path d="M798 78H876V132H798Z" fill="#eadcb8"/>
      <path d="M824 90H850V94H824ZM812 102H862V106H812ZM814 112H860V116H814ZM826 122H850V126H826Z" fill="#a28b64"/>
      <path d="M84 236H174V242H180V324H78V242H84Z" fill="#644a34"/><path d="M84 238H174V244H84Z" fill="#d2a76a"/>
      <path d="M90 248H168V308H90Z" fill="#9a7047"/><path d="M96 254H162V300H96Z" fill="#765238"/>
      <Scales x={128} y={156}/>
      <path d="M786 236H876V242H882V324H780V242H786Z" fill="#644a34"/><path d="M786 238H876V244H786Z" fill="#d2a76a"/>
      <path d="M792 248H870V308H792Z" fill="#9a7047"/><path d="M798 254H864V300H798Z" fill="#765238"/>
      <path d="M800 216H820V234H800ZM824 208H840V234H824ZM844 212H864V234H844Z" fill="#4a5961"/>
      <path d="M804 220H816V224H804ZM828 214H836V218H828ZM848 218H860V222H848Z" fill="#dbc58b"/>
    </g>
    <Scales x={480} y={198}/>
    <path d="M418 284H542V290H418ZM426 290H534V298H426Z" fill="#b78d52"/>
    <path d="M300 394H660V398H674V414H286V400H300Z" fill="#583f31" opacity=".22"/>
  </>;
}
