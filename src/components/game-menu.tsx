"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { PixelIcon } from "./ui";

/** The only chrome during a game: a compact menu button with room controls in a popover. */
export function GameMenu({ roomCode, onSettings, onHome, children }: {
  roomCode: string; onSettings: () => void; onHome: () => void; children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); toggle.current?.focus(); } };
    const onPointer = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("pointerdown", onPointer); };
  }, [open]);
  return <div className="game-menu" ref={root}>
    <button ref={toggle} type="button" className="game-menu-toggle" aria-expanded={open} aria-controls={id} onClick={() => setOpen(value => !value)}>
      <span className="game-menu-code">{roomCode}</span>Menu<PixelIcon name={open ? "close" : "chat"}/>
    </button>
    <div id={id} className="game-menu-panel pixel-panel" hidden={!open} role="group" aria-label="Game menu">
      <div className="game-menu-actions">
        <button type="button" aria-haspopup="dialog" onClick={() => { setOpen(false); onSettings(); }}>Settings</button>
        <button type="button" onClick={() => { setOpen(false); onHome(); }}>Back to start</button>
      </div>
      {children}
    </div>
  </div>;
}
