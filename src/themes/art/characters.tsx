/** Original characters on the same 96×112, two-unit grid as the Jungle cast. */
import type { ComponentType } from "react";

type PortraitColors = { skin: string; light: string; shade: string; hair: string; hairLight: string; ink: string; white: string };
const warm: PortraitColors = { skin:"#d79b70", light:"#f4c69b", shade:"#9a604b", hair:"#28313e", hairLight:"#455369", ink:"#202735", white:"#fff1d2" };
const deep: PortraitColors = { skin:"#a96c51", light:"#cc9370", shade:"#70463e", hair:"#252a35", hairLight:"#454655", ink:"#202735", white:"#fff0d4" };
const pale: PortraitColors = { skin:"#dcb9a0", light:"#f3d3b7", shade:"#b68a76", hair:"#78513c", hairLight:"#b0784d", ink:"#28313b", white:"#fff3da" };
const mono: PortraitColors = { skin:"#b8b8b8", light:"#dfdfdf", shade:"#858585", hair:"#2b2b2b", hairLight:"#4f4f4f", ink:"#262626", white:"#f1f1f1" };

function Face({ colors = warm, smile = true }: { colors?: PortraitColors; smile?: boolean }) {
  return <>
    <path d="M30 20H38V16H58V20H66V28H70V44H66V52H60V58H38V54H30V46H26V30H30Z" fill={colors.shade}/>
    <path d="M32 20H40V18H56V22H64V30H66V44H62V50H58V54H40V50H34V44H30V30H32Z" fill={colors.skin}/>
    <path d="M36 24H42V22H54V26H60V32H62V42H58V46H40V42H34V32H36Z" fill={colors.light}/>
    <path d="M26 34H30V44H26V40H24V36H26ZM66 34H70V38H72V42H66Z" fill={colors.skin}/>
    <path d="M32 32H42V34H32ZM52 32H62V34H52Z" fill={colors.hair}/>
    <path d="M34 36H44V44H34ZM52 36H62V44H52Z" fill={colors.white}/>
    <path d="M38 36H44V44H38ZM52 36H58V44H52Z" fill={colors.ink}/>
    <path d="M38 36H40V38H38ZM52 36H54V38H52Z" fill="#ffffff"/>
    <path d="M46 40H50V46H54V48H46Z" fill={colors.shade}/>
    <g className="sprite-mouth">
      {smile ? <><path d="M40 48H56V52H52V54H44V52H40Z" fill={colors.ink}/><path d="M42 48H54V50H42Z" fill={colors.white}/></> : <path d="M42 50H54V52H42Z" fill={colors.ink}/>}
    </g>
  </>;
}

function ShortHair({ color = warm.hair, highlight = warm.hairLight }: { color?: string; highlight?: string }) {
  return <>
    <path d="M28 32V20H32V14H42V10H58V14H66V20H70V34H64V26H56V24H46V20H40V26H34V34Z" fill={color}/>
    <path d="M32 20H40V16H54V14H58V18H64V22H54V20H46V18H40V22H34V28H30V24H32Z" fill={highlight}/>
    <path d="M28 34H32V42H28ZM64 32H68V40H64Z" fill={color}/>
  </>;
}

function CurlyHair({ color = deep.hair, highlight = deep.hairLight }: { color?: string; highlight?: string }) {
  return <>
    <path d="M28 38H24V24H28V18H32V12H40V10H48V12H54V10H62V14H68V20H72V30H68V40H64V28H58V24H50V26H42V22H36V28H32V38Z" fill={color}/>
    <path d="M30 20H34V16H40V14H46V18H40V20H34V26H28V24H30ZM50 16H56V14H62V18H66V24H60V20H54V22H50Z" fill={highlight}/>
  </>;
}

function Boots({ suit, light, ink = "#222938" }: { suit: string; light: string; ink?: string }) {
  return <>
    <path d="M32 82H46V104H42V108H24V102H30V88H32ZM52 82H66V100H72V108H52Z" fill={ink}/>
    <path d="M34 86H44V100H40V104H28V102H34ZM54 86H64V100H68V104H54Z" fill={suit}/>
    <path d="M34 88H38V100H34ZM54 88H58V102H54Z" fill={light}/>
    <path d="M28 104H42V106H28ZM54 104H68V106H54Z" fill={light}/>
  </>;
}

function Gavel({ wood = "#ab7043", shine = "#e7bc71", outline = "#4f382e" }: { wood?: string; shine?: string; outline?: string }) {
  return <>
    <path d="M78 42H82V72H76V66H78Z" fill={outline}/>
    <path d="M78 48H80V66H78Z" fill={wood}/>
    <path d="M68 32H86V36H90V46H86V50H68V46H64V36H68Z" fill={outline}/>
    <path d="M68 36H86V44H68Z" fill={wood}/>
    <path d="M70 36H84V38H70ZM68 38H70V44H68Z" fill={shine}/>
    <path d="M82 38H86V44H82Z" fill={outline} opacity=".45"/>
  </>;
}

function HeroRook() {
  return <>
    <path d="M30 50H64V60H70V74H74V92H82V102H58V96H46V102H18V96H22V78H26V62H30Z" fill="#142b3c"/>
    <path d="M30 56H62V64H66V84H72V96H58V90H46V96H24V88H28V68H30Z" fill="#cda64e"/>
    <path d="M32 60H40V92H28V84H30Z" fill="#f5cf70"/>
    <Boots suit="#294b56" light="#43878a"/>
    <path d="M32 54H62V58H68V70H64V88H32V84H28V64H32Z" fill="#193a48"/>
    <path d="M36 56H58V62H62V80H58V88H34V78H32V64H36Z" fill="#2b7b7b"/>
    <path d="M36 58H44V78H38V84H34V68H36Z" fill="#51b9ac"/>
    <path d="M32 58H40V62H46V66H50V62H58V58H64V66H58V68H52V72H44V68H38V66H32Z" fill="#f1c65d"/>
    <path d="M42 72H54V76H50V80H46V76H42Z" fill="#e9d58a"/>
    <path d="M30 84H64V90H30Z" fill="#e3b955"/><path d="M44 84H52V90H44Z" fill="#f9e7aa"/>
    <path d="M26 60H34V70H30V82H26V88H18V80H22V70H26Z" fill="#245761"/>
    <path d="M20 80H28V86H30V92H20V88H18V84H20Z" fill="#d19a70"/>
    <path d="M64 60H70V66H76V62H82V70H78V76H68V72H62Z" fill="#367f80"/>
    <Gavel wood="#d2a54f" shine="#fae4a0" outline="#293947"/>
    <path d="M74 62H82V68H86V74H78V72H74Z" fill="#d19a70"/>
    <Face colors={deep}/><ShortHair color="#263239" highlight="#4d6264"/>
    <path d="M30 34H44V36H50V34H66V44H62V46H52V42H44V46H34V42H30Z" fill="#1b5158"/>
    <path d="M34 36H42V42H34ZM54 36H62V42H54Z" fill="#f8e7a4"/>
    <path d="M38 36H42V42H38ZM54 36H58V42H54Z" fill="#23303e"/>
    <path d="M34 32H44V34H34ZM52 32H64V34H52Z" fill="#58c5b5"/>
    <path d="M34 54H42V58H54V54H62V60H56V64H42V62H36Z" fill="#f0ce70"/>
  </>;
}

function HeroScout() {
  return <>
    <path d="M30 52H62V62H68V78H72V98H56V92H44V100H18V94H24V72H28Z" fill="#7c3c59"/>
    <path d="M30 58H60V66H64V80H68V92H56V88H42V94H24V90H28V72H30Z" fill="#e27b76"/>
    <path d="M28 68H32V86H28V92H24V88H26Z" fill="#ffb795"/>
    <Boots suit="#294d62" light="#4c8c99"/>
    <path d="M30 58H64V64H68V78H62V90H32V84H28V66H30Z" fill="#24596b"/>
    <path d="M34 58H58V66H62V78H56V86H34V80H32V66H34Z" fill="#42a8ad"/>
    <path d="M36 62H42V80H36Z" fill="#7bdac8"/>
    <path d="M34 56H42V62H48V66H54V60H60V56H64V62H58V66H52V70H44V66H38V64H34Z" fill="#f5d888"/>
    <path d="M30 82H62V88H30Z" fill="#e9d798"/><path d="M46 82H52V88H46Z" fill="#fcf0c3"/>
    <path d="M26 62H34V72H30V82H24V88H16V80H20V72H24V66H26Z" fill="#2a7584"/>
    <path d="M16 80H24V86H26V92H16V88H14V84H16Z" fill="#e2ac8a"/>
    <path d="M62 62H70V66H76V60H82V66H78V74H72V78H64Z" fill="#3193a0"/>
    <path d="M74 56H82V60H86V66H80V70H74Z" fill="#e2ac8a"/>
    <path d="M78 50H88V54H92V60H88V62H76V58H74V54H78Z" fill="#243748"/>
    <path d="M82 52H88V58H82Z" fill="#88dfdf"/><path d="M84 52H88V54H84Z" fill="#e6f8ec"/>
    <path d="M58 20H72V26H78V40H82V56H74V66H64V56H60Z" fill="#783e43"/>
    <path d="M66 26H72V36H76V54H70V60H66V48H64V32H66Z" fill="#d97858"/>
    <Face colors={{...pale,hair:"#7c3d3a",hairLight:"#cd7351"}}/>
    <path d="M28 36H24V22H28V16H34V12H54V14H62V18H68V28H64V30H58V24H52V20H44V24H38V30H34V40H28Z" fill="#85403f"/>
    <path d="M30 22H34V18H42V16H54V18H60V22H52V20H44V26H38V30H32V34H28V28H30Z" fill="#df865c"/>
    <path d="M32 20H40V18H48V20H40V24H34V28H30V24H32Z" fill="#f7b77b"/>
    <path d="M30 34H34V46H30V42H28V36H30Z" fill="#85403f"/>
    <path d="M62 30H68V34H62Z" fill="#8be0c9"/>
    <path d="M36 52H42V56H56V52H60V58H56V62H42V60H36Z" fill="#f4a28a"/>
    <path d="M46 60H52V66H46Z" fill="#f5d888"/>
  </>;
}

function HeroInventor() {
  return <>
    <path d="M60 52H70V58H74V80H68V88H60Z" fill="#343752"/>
    <path d="M64 58H70V76H66V82H64Z" fill="#6775a0"/>
    <Boots suit="#414e71" light="#7d8db1"/>
    <path d="M30 56H64V62H70V84H64V92H30V86H26V66H30Z" fill="#343653"/>
    <path d="M34 58H60V64H66V82H60V88H34V82H30V68H34Z" fill="#7772b0"/>
    <path d="M36 60H42V82H36ZM56 64H60V82H56Z" fill="#aaa4da"/>
    <path d="M42 58H54V62H58V70H38V64H42Z" fill="#e4dfcc"/>
    <path d="M44 66H52V74H44Z" fill="#55c8c7"/>
    <path d="M28 82H66V88H28Z" fill="#bca66e"/>
    <path d="M32 80H40V90H32ZM54 80H62V90H54Z" fill="#d7c490"/>
    <path d="M34 82H38V86H34ZM56 82H60V86H56Z" fill="#84714f"/>
    <path d="M24 64H32V74H28V84H22V88H16V82H20V72H24Z" fill="#565d91"/>
    <path d="M16 82H24V88H28V94H16V90H14V86H16Z" fill="#b77957"/>
    <path d="M62 62H72V68H78V80H72V76H66V72H62Z" fill="#8f86c5"/>
    <path d="M72 74H80V80H84V86H76V84H72Z" fill="#b77957"/>
    <path d="M70 64H90V84H70Z" fill="#253441"/>
    <path d="M74 68H86V76H74Z" fill="#65cfc2"/><path d="M76 70H82V72H76ZM78 78H82V80H78Z" fill="#e8e6ba"/>
    <Face colors={deep}/><CurlyHair/>
    <path d="M26 28H70V34H26Z" fill="#c8b576"/>
    <path d="M30 26H44V36H30ZM50 26H64V36H50Z" fill="#242f45"/>
    <path d="M32 28H42V34H32ZM52 28H62V34H52Z" fill="#b6dce3"/>
    <path d="M32 28H36V30H32ZM52 28H56V30H52Z" fill="#ffffff"/>
    <path d="M44 30H50V32H44Z" fill="#f4d282"/>
    <path d="M32 54H40V60H56V54H64V60H58V64H40V62H34Z" fill="#444e70"/>
  </>;
}

function Fedora() {
  return <>
    <path d="M28 24H32V12H38V8H58V12H64V24H72V28H76V32H24V28H20V24Z" fill="#282828"/>
    <path d="M34 14H40V12H56V16H60V24H34Z" fill="#646464"/>
    <path d="M38 14H44V12H54V16H58V20H36V18H38Z" fill="#868686"/>
    <path d="M32 22H64V26H32Z" fill="#1c1c1c"/>
    <path d="M24 26H70V28H24Z" fill="#979797"/>
    <path d="M28 30H68V34H28Z" fill="#454545"/>
  </>;
}

function DetectiveVale() {
  return <>
    <Boots suit="#424242" light="#6f6f6f" ink="#212121"/>
    <path d="M30 54H64V60H70V80H74V100H54V92H44V100H24V94H26V70H30Z" fill="#3b3b3b"/>
    <path d="M32 58H60V64H66V84H68V96H54V90H44V96H28V80H30V66H32Z" fill="#949494"/>
    <path d="M32 62H38V92H30V80H32ZM56 66H62V90H58Z" fill="#b7b7b7"/>
    <path d="M38 56H58V62H54V72H42V66H38Z" fill="#e1e1e1"/>
    <path d="M46 62H52V68H50V82H44V68H46Z" fill="#353535"/>
    <path d="M32 56H38V64H44V72H40V78H34V72H30V62H32ZM58 56H64V64H60V74H54V78H50V72H56V64H58Z" fill="#cecece"/>
    <path d="M28 82H68V88H28Z" fill="#656565"/><path d="M44 82H52V88H44Z" fill="#d0d0d0"/><path d="M46 84H50V86H46Z" fill="#565656"/>
    <path d="M24 64H32V76H28V86H20V80H22V70H24Z" fill="#808080"/>
    <path d="M18 82H28V90H18V88H16V84H18Z" fill="#b8b8b8"/>
    <path d="M64 64H72V70H78V68H82V78H76V82H66V76H62Z" fill="#a7a7a7"/>
    <path d="M74 66H82V72H86V78H80V80H74Z" fill="#b8b8b8"/>
    <path d="M80 48H84V70H78V64H80Z" fill="#2a2a2a"/>
    <path d="M74 34H84V38H90V48H86V54H74V50H70V38H74Z" fill="#2b2b2b"/>
    <path d="M76 38H84V42H86V48H76V46H74V40H76Z" fill="#cacaca"/>
    <path d="M76 38H82V40H78V44H76Z" fill="#f2f2f2"/>
    <Face colors={mono} smile={false}/><ShortHair color="#393939" highlight="#676767"/>
    <path d="M50 32H64V42H60V48H56V50H50Z" fill="#616161" opacity=".34"/>
    <path d="M32 34H44V36H32ZM52 32H64V34H52Z" fill="#292929"/>
    <Fedora/>
    <path d="M36 54H42V58H46V62H42V64H36Z" fill="#aaaaaa"/>
  </>;
}

function DetectiveReporter() {
  return <>
    <path d="M28 22H34V14H54V16H62V22H68V54H62V60H28V54H24V30H28Z" fill="#292929"/>
    <path d="M28 30H34V54H30V50H28ZM62 28H66V50H62Z" fill="#505050"/>
    <Boots suit="#414141" light="#6c6c6c" ink="#262626"/>
    <path d="M32 58H62V64H66V84H62V96H30V90H28V68H32Z" fill="#434343"/>
    <path d="M34 60H58V66H62V82H58V90H32V82H30V68H34Z" fill="#747474"/>
    <path d="M36 60H42V82H36ZM54 64H58V80H54Z" fill="#9f9f9f"/>
    <path d="M38 56H56V62H52V70H44V66H38Z" fill="#ebebeb"/>
    <path d="M44 62H50V68H48V80H44V68H42V64H44Z" fill="#282828"/>
    <path d="M30 84H62V90H30Z" fill="#2c2c2c"/><path d="M44 84H52V88H44Z" fill="#c4c4c4"/>
    <path d="M24 66H32V76H28V82H22V84H16V78H20V72H24Z" fill="#636363"/>
    <path d="M16 78H24V84H28V90H18V88H14V82H16Z" fill="#c2c2c2"/>
    <path d="M64 64H72V70H76V78H70V76H64Z" fill="#8c8c8c"/>
    <path d="M70 74H80V82H72V80H68V76H70Z" fill="#c2c2c2"/>
    <path d="M62 66H84V90H62Z" fill="#393939"/><path d="M66 68H80V86H66Z" fill="#e4e4e4"/>
    <path d="M68 72H78V74H68ZM68 78H76V80H68ZM68 84H74V86H68Z" fill="#a6a6a6"/>
    <path d="M82 62H86V84H82Z" fill="#606060"/><path d="M82 60H86V64H82Z" fill="#e1e1e1"/>
    <Face colors={{...mono,skin:"#c1c1c1",light:"#e1e1e1",shade:"#979797"}}/>
    <path d="M28 36H24V24H28V18H34V14H56V18H62V22H66V32H60V28H54V24H44V28H38V34H32V44H28Z" fill="#323232"/>
    <path d="M32 22H38V18H52V20H58V24H48V26H42V30H36V34H30V28H32Z" fill="#5d5d5d"/>
    <path d="M32 20H38V18H46V20H38V24H34V26H30V24H32Z" fill="#848484"/>
    <path d="M62 32H66V50H62V54H58V48H62Z" fill="#323232"/>
    <path d="M28 26H34V30H28Z" fill="#b3b3b3"/>
    <path d="M34 46H38V48H34ZM58 46H62V48H58Z" fill="#adadad"/>
  </>;
}

function DetectiveWitness() {
  return <>
    <Boots suit="#5c5c5c" light="#8c8c8c" ink="#282828"/>
    <path d="M30 58H64V64H70V86H64V94H30V88H26V68H30Z" fill="#4a4a4a"/>
    <path d="M34 58H58V64H64V84H58V90H34V84H30V70H34Z" fill="#d2d2d2"/>
    <path d="M30 60H38V74H44V90H30V82H28V68H30ZM56 60H64V70H66V86H60V92H52V76H56Z" fill="#787878"/>
    <path d="M32 64H36V76H40V86H34V80H32ZM58 64H62V76H60V84H56V76H58Z" fill="#989898"/>
    <path d="M40 58H56V64H50V68H46V64H40Z" fill="#ebebeb"/>
    <path d="M44 64H52V70H44Z" fill="#616161"/><path d="M46 70H50V84H46Z" fill="#757575"/>
    <path d="M46 78H50V82H46ZM46 86H50V90H46Z" fill="#e3e3e3"/>
    <path d="M56 78H62V80H60V84H54V82H56Z" fill="#c0c0c0"/>
    <path d="M24 64H30V72H26V84H20V88H14V82H18V72H22V68H24Z" fill="#c6c6c6"/>
    <path d="M16 82H24V90H16V88H14V84H16Z" fill="#a8a8a8"/>
    <path d="M66 64H74V70H78V84H72V78H68V74H66Z" fill="#d2d2d2"/>
    <path d="M72 82H80V90H72Z" fill="#a8a8a8"/>
    <path d="M70 88H76V84H84V88H90V106H66V88H70ZM76 86V90H82V86Z" fill="#2f2f2f" fillRule="evenodd"/>
    <path d="M70 92H86V102H70Z" fill="#5e5e5e"/><path d="M76 92H80V96H76Z" fill="#b4b4b4"/>
    <Face colors={{...mono,skin:"#aeaeae",light:"#cbcbcb",shade:"#7e7e7e"}} smile={false}/>
    <CurlyHair color="#404040" highlight="#6d6d6d"/>
    <path d="M32 34H42V36H32ZM54 32H64V34H54Z" fill="#3f3f3f"/>
    <path d="M38 54H44V58H54V54H60V60H54V64H44V62H38Z" fill="#d4d4d4"/>
  </>;
}

function CourtJudge() {
  return <>
    <Boots suit="#393949" light="#656277" ink="#232532"/>
    <path d="M30 54H64V60H70V80H76V102H66V106H28V102H22V80H26V62H30Z" fill="#272b3b"/>
    <path d="M32 60H40V98H28V92H26V80H30V68H32ZM56 60H64V72H68V96H64V102H56Z" fill="#444457"/>
    <path d="M32 68H36V92H32ZM60 74H64V94H60Z" fill="#656073"/>
    <path d="M36 54H60V60H56V68H42V64H36Z" fill="#f1e6d1"/>
    <path d="M42 60H46V82H40V72H42ZM50 62H54V82H48V72H50Z" fill="#fff4e0"/>
    <path d="M44 82H52V88H44Z" fill="#a64d4f"/>
    <path d="M24 68H32V78H28V88H20V82H22V74H24Z" fill="#3c3e51"/>
    <path d="M18 84H28V92H18V90H16V86H18Z" fill="#a36e54"/>
    <path d="M64 66H72V70H76V64H82V74H78V80H68V76H64Z" fill="#4b495e"/>
    <Gavel/>
    <path d="M74 64H82V70H86V76H78V74H74Z" fill="#a36e54"/>
    <Face colors={{...deep,skin:"#a36e54",light:"#c59070",shade:"#704b43"}} smile={false}/>
    <CurlyHair color="#37323c" highlight="#6c5d65"/>
    <path d="M26 28H30V36H26ZM64 22H68V30H64ZM58 16H62V20H58Z" fill="#c5bdba"/>
    <path d="M30 34H44V44H30ZM50 34H64V44H50Z" fill="#bfa666"/>
    <path d="M32 36H42V42H32ZM52 36H62V42H52Z" fill="#e2c7ac"/>
    <path d="M38 36H42V42H38ZM52 36H56V42H52Z" fill="#302d3b"/>
    <path d="M44 36H50V38H44Z" fill="#d7ba76"/>
    <path d="M30 34H34V36H30ZM50 34H54V36H50Z" fill="#f6e1aa"/>
  </>;
}

function AdvocateA() {
  return <>
    <Boots suit="#35495f" light="#627b8b" ink="#25313c"/>
    <path d="M30 56H64V62H70V84H64V94H30V88H26V66H30Z" fill="#253c54"/>
    <path d="M34 58H58V64H64V82H58V90H34V82H30V68H34Z" fill="#41617b"/>
    <path d="M34 62H40V82H34ZM56 66H60V84H56Z" fill="#7390a2"/>
    <path d="M38 56H58V62H52V72H44V66H38Z" fill="#f2e5cc"/>
    <path d="M44 62H52V68H50V82H44V68H42V64H44Z" fill="#b15c4d"/>
    <path d="M34 56H40V64H44V72H40V78H34V70H30V62H34ZM58 56H64V66H60V74H54V78H50V72H56V64H58Z" fill="#8aabbb"/>
    <path d="M30 84H64V88H30Z" fill="#253b4e"/>
    <path d="M46 84H50V88H46ZM46 76H50V80H46Z" fill="#e4c584"/>
    <path d="M24 62H32V72H28V84H22V88H16V82H20V72H24Z" fill="#38576f"/>
    <path d="M16 82H24V90H16V88H14V84H16Z" fill="#dfb690"/>
    <path d="M64 62H72V68H76V80H70V76H66V70H64Z" fill="#50718b"/>
    <path d="M70 76H80V84H72V82H68V78H70Z" fill="#dfb690"/>
    <path d="M64 70H86V94H64Z" fill="#6b4937"/><path d="M68 72H82V90H68Z" fill="#d3af71"/>
    <path d="M70 76H80V78H70ZM70 82H78V84H70Z" fill="#f2db9f"/>
    <Face colors={{...pale,hair:"#866338",hairLight:"#c7a264"}}/>
    <ShortHair color="#896639" highlight="#d3ac66"/>
    <path d="M34 18H40V16H50V18H42V20H36V24H32V22H34Z" fill="#f5d293"/>
    <path d="M36 54H44V58H54V54H60V60H54V62H44V60H38Z" fill="#f8ecd7"/>
  </>;
}

function AdvocateB() {
  return <>
    <path d="M28 24H32V16H40V12H56V16H64V22H68V50H64V58H28V54H24V32H28Z" fill="#3c3039"/>
    <path d="M28 32H32V50H28ZM62 28H66V48H62Z" fill="#725357"/>
    <Boots suit="#4f354a" light="#8c5d70" ink="#302c39"/>
    <path d="M30 58H64V64H68V84H64V96H30V90H26V66H30Z" fill="#643b52"/>
    <path d="M34 60H58V66H64V82H60V90H32V82H30V68H34Z" fill="#a35d72"/>
    <path d="M34 62H40V82H34ZM56 66H60V82H56Z" fill="#ce8995"/>
    <path d="M38 56H58V62H52V72H44V66H38Z" fill="#f0dcc1"/>
    <path d="M42 62H48V70H44V82H40V74H42ZM50 64H54V80H48V72H50Z" fill="#fff0d5"/>
    <path d="M30 86H64V90H30Z" fill="#754252"/><path d="M46 82H50V86H46ZM46 90H50V94H46Z" fill="#e5c68c"/>
    <path d="M24 64H32V74H28V84H22V88H16V82H20V72H24Z" fill="#8e4c67"/>
    <path d="M16 82H24V90H16V88H14V84H16Z" fill="#bd8867"/>
    <path d="M64 64H72V70H76V78H70V76H64Z" fill="#b87287"/>
    <path d="M70 74H80V82H72V80H68V76H70Z" fill="#bd8867"/>
    <path d="M62 68H84V94H62Z" fill="#284d50"/><path d="M66 70H80V90H66Z" fill="#548982"/>
    <path d="M66 70H70V90H66ZM74 76H78V78H74Z" fill="#d9c48a"/>
    <Face colors={{...deep,skin:"#bd8867",light:"#dfac85",shade:"#95604f"}}/>
    <path d="M28 36H24V26H28V20H32V14H42V12H56V16H64V22H68V32H62V28H56V24H48V22H42V28H36V34H32V44H28Z" fill="#49333d"/>
    <path d="M30 24H34V20H40V16H50V18H56V20H60V24H50V22H44V26H38V32H32V36H28V30H30Z" fill="#855b5d"/>
    <path d="M34 20H40V18H46V20H40V24H36V28H32V26H34Z" fill="#b07a72"/>
    <path d="M28 44H32V48H28ZM64 42H68V46H64Z" fill="#e4c580"/>
    <path d="M38 54H44V58H54V54H60V60H54V62H44V60H38Z" fill="#f2ddbe"/>
  </>;
}

export const characterArt: Record<string, ComponentType> = {
  "superhero-scout": HeroScout,
  "superhero-inventor": HeroInventor,
  "superhero-rook": HeroRook,
  "detective-reporter": DetectiveReporter,
  "detective-witness": DetectiveWitness,
  "detective-vale": DetectiveVale,
  "courtroom-advocate-a": AdvocateA,
  "courtroom-advocate-b": AdvocateB,
  "courtroom-rowan": CourtJudge,
};
