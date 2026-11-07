"use client";

import { useEffect, useRef } from "react";
import { PixelButton, PixelIcon } from "./ui";

export function AboutDialog({open, onClose}: {open: boolean; onClose: ()=>void}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(()=>{if(open && !ref.current?.open) ref.current?.showModal(); else if(!open && ref.current?.open) ref.current?.close();},[open]);
  return <dialog ref={ref} onClose={onClose} className="about-dialog pixel-panel" aria-labelledby="about-title">
    <button className="dialog-close" aria-label="Close guide" onClick={onClose}><PixelIcon name="close"/></button>
    <span className="eyebrow">WELCOME TO REHEARSAL</span><h2 id="about-title">A little wild.<br/>A lot to say.</h2>
    <p>quarrel.io is a tropical debate courtroom for two opposing perspectives and one neutral AI judge.</p>
    <p><strong>This is Stage 1: a local visual preview.</strong> Leo, Zuri and Judge Moki are rehearsing. There is no live opponent or AI here yet.</p>
    <ol><li>Choose a character in the Director’s booth and try a state. Idle and speaking animate; the other six use placeholder poses.</li><li>Pick a sample line to change Moki’s speech bubble.</li><li>Write a practice argument or try Objection. These controls only update this tab.</li></ol>
    <p className="guide-note">The room code, round and timer are placeholders. Reload or Reset preview starts fresh. Reduced-motion preferences are respected.</p>
    <PixelButton onClick={onClose}>Back to the jungle<PixelIcon name="arrow"/></PixelButton>
  </dialog>;
}
