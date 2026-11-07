"use client";

import { useState, type FormEvent } from "react";
import { Courtroom } from "./courtroom";
import { PreviewControls } from "./preview-controls";
import { DebateHistory } from "./debate-history";
import { ArgumentComposer } from "./argument-composer";
import { AboutDialog } from "./about-dialog";
import { PixelIcon } from "./ui";
import { initialStates, judgeDialogue, sampleHistory, type CharacterId, type CharacterState, type CharacterStates, type DebateEntry } from "@/lib/preview";

export function QuarrelApp() {
  const [states,setStates] = useState<CharacterStates>({...initialStates});
  const [selected,setSelected] = useState<CharacterId>("lemur");
  const [dialogueIndex,setDialogueIndex] = useState(0);
  const [paused,setPaused] = useState(false);
  const [draft,setDraft] = useState("");
  const [entries,setEntries] = useState<DebateEntry[]>(sampleHistory);
  const [notice,setNotice] = useState("");
  const [guideOpen,setGuideOpen] = useState(false);

  function changeState(state:CharacterState) {setStates(current=>({...current,[selected]:state}));}
  function changeDialogue(index:number) {setDialogueIndex(index);setStates(current=>({...current,lemur:"speaking"}));}
  function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();const text=draft.trim();if(!text)return;
    setEntries(current=>[...current,{id:crypto.randomUUID(),speaker:"lion",text,tag:"Local preview"}]);
    setStates(current=>({...current,lion:"speaking"}));setDraft("");setNotice("Added to this tab’s practice transcript. No AI response or score is generated.");
  }
  function objection() {changeDialogue(3);setStates(current=>({...current,lion:"objection"}));setNotice("Objection preview! Moki is reading a sample line; no debate decision was made.");}
  function reset() {setStates({...initialStates});setSelected("lemur");setDialogueIndex(0);setPaused(false);setDraft("");setEntries(sampleHistory);setNotice("Preview reset. Welcome back to the jungle.");}

  return <>
    <a className="skip-link" href="#courtroom-content">Skip to courtroom</a>
    <header className="site-header"><div className="header-inner">
      <a className="brand" href="/" aria-label="quarrel.io home"><span className="brand-mark"><PixelIcon name="chat"/></span><span>quarrel<span className="brand-dot">.</span>io</span></a>
      <div className="header-divider"/><span className="brand-caption">BIG OPINIONS.<br/>JUNGLE RULES.</span>
      <nav aria-label="Main navigation"><a href="#courtroom-content" className="nav-current">The courtroom</a><button onClick={()=>setGuideOpen(true)}>How to play <span>↗</span></button></nav>
      <div className="stage-badge"><span className="status-dot"/>STAGE 01 <span>/ LOCAL PREVIEW</span></div>
    </div></header>
    <main id="courtroom-content" className="app-shell" tabIndex={-1}>
      <section className="topic-bar" aria-label="Demo debate topic"><div className="topic-icon"><PixelIcon name="gavel"/></div><div className="topic-copy"><p className="eyebrow">ON TODAY’S DOCKET <span>· SAMPLE TOPIC</span></p><h1>Does pineapple belong on pizza?</h1></div><div className="round-placeholder"><span className="eyebrow">ROUND <strong>01 <span>/ 03</span></strong></span><span>Opening arguments <span className="round-demo">· demo</span></span></div></section>
      <div className="court-layout">
        <Courtroom states={states} dialogue={judgeDialogue[dialogueIndex].text} dialogueIndex={dialogueIndex} paused={paused}/>
        <PreviewControls selected={selected} onSelect={setSelected} states={states} onState={changeState} dialogueIndex={dialogueIndex} onDialogue={changeDialogue} paused={paused} onPause={()=>setPaused(value=>!value)} onReset={reset}/>
      </div>
      <div className="conversation-layout"><DebateHistory entries={entries}/><ArgumentComposer draft={draft} onDraft={setDraft} onSubmit={submit} onObjection={objection} notice={notice}/></div>
      <footer className="site-footer"><span><PixelIcon name="leaf"/> DIFFERENT VIEWS. SAME JUNGLE.</span><span>Made for Digital Sidekick <span className="footer-star">✦</span> Stage 1 of 7</span></footer>
    </main>
    <AboutDialog open={guideOpen} onClose={()=>setGuideOpen(false)}/>
  </>;
}
