"use client";

import { useEffect, useRef, useState } from "react";
import { themes, type CharacterPosition, type ThemeId } from "@/themes";
import { SidekickSprite } from "@/themes/art/sidekicks";
import { PixelSprite } from "@/themes/art/pixel/pixel-sprite";
import { colorCount, evenScale } from "@/themes/art/pixel/grid";
import { MASCOT_ACCESSORIES, getPixelAsset, lawyerArtFor, pixelAssetIds, renderPixelAsset } from "@/themes/art/pixel/roster";
import { reactions, type Reaction } from "@/themes/art/pixel/types";
import styles from "./pixel-lab.module.css";

const sizes = [32, 48, 64, 96, 144, 192] as const;

function useFrameClock(enabled: boolean) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const timer = window.setInterval(() => setTick(value => value + 1), 420);
    return () => window.clearInterval(timer);
  }, [enabled]);
  return tick;
}

/** Measures rendered sprites for fractional sizes or positions, the browser-side causes of uneven pixels. */
function SizeProbe({ width, assetId, accessories }: { width: number; assetId: string; accessories: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [measure, setMeasure] = useState<{ ratio: number; offset: number } | null>(null);
  useEffect(() => {
    function update() {
      const svg = ref.current?.querySelector("svg");
      if (!svg) return;
      const box = svg.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      setMeasure({ ratio: dpr, offset: Math.abs((box.left * dpr) - Math.round(box.left * dpr)) });
    }
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [width]);
  const dpr = measure?.ratio ?? 1;
  const perCell = (width * dpr) / 48;
  const even = evenScale(width, dpr) && (measure ? measure.offset < 0.01 : true);
  return <figure className={styles.sizeCard} data-even={even}>
    <div ref={ref} className={styles.sizeFrame} style={{ width, height: (width * 112) / 96 }}>
      <PixelSprite assetId={assetId} label={`${getPixelAsset(assetId).character.description} at ${width} pixels`} accessories={accessories}/>
    </div>
    <figcaption><strong>{width}px</strong><span>{perCell.toFixed(2)} device px per cell</span><span className={styles.verdict}>{even ? "Even pixels" : "Uneven pixels"}</span></figcaption>
  </figure>;
}

export function PixelLab() {
  const [themeId, setThemeId] = useState<ThemeId>("courtroom");
  const [reaction, setReaction] = useState<Reaction>("idle");
  const [accessories, setAccessories] = useState(MASCOT_ACCESSORIES);
  const [swapped, setSwapped] = useState(false);
  const [animate, setAnimate] = useState(false);
  const [dark, setDark] = useState(false);
  const tick = useFrameClock(animate);

  useEffect(() => {
    const motion = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    setAnimate(!motion?.matches);
  }, []);

  const theme = themes.find(item => item.id === themeId)!;
  const slotFor = (slot: CharacterPosition): CharacterPosition => (swapped ? (slot === "A" ? "B" : "A") : slot);
  const mascotA = lawyerArtFor(themeId, slotFor("A")).mascot;
  const mascotB = lawyerArtFor(themeId, slotFor("B")).mascot;

  return <div className={styles.lab} data-dark={dark}>
    <header className={styles.header}>
      <div><p className={styles.eyebrow}>LOCAL ART REVIEW</p><h1>Pixel Lab</h1>
        <p>Every sprite here comes from the same pixel data the app renders. Nothing on this page is saved or shared.</p></div>
      <a href="/settings">Settings</a>
    </header>

    <section className={styles.controls} aria-label="Lab controls">
      <label>Theme<select value={themeId} onChange={event => setThemeId(event.target.value as ThemeId)}>{themes.map(item => <option key={item.id} value={item.id}>{item.displayName}</option>)}</select></label>
      <label>Reaction<select value={reaction} onChange={event => setReaction(event.target.value as Reaction)}>{reactions.map(item => <option key={item} value={item}>{item}</option>)}</select></label>
      <label className={styles.check}><input type="checkbox" checked={accessories} onChange={event => setAccessories(event.target.checked)}/>Theme accessories</label>
      <label className={styles.check}><input type="checkbox" checked={swapped} onChange={event => setSwapped(event.target.checked)}/>Swap lawyer A and B (preview only)</label>
      <label className={styles.check}><input type="checkbox" checked={animate} onChange={event => setAnimate(event.target.checked)}/>Play frames</label>
      <label className={styles.check}><input type="checkbox" checked={dark} onChange={event => setDark(event.target.checked)}/>Dark backdrop</label>
    </section>

    <section aria-labelledby="lineup-title">
      <h2 id="lineup-title">{theme.displayName} lawyer lineup</h2>
      <p className={styles.note}>Original drawing, pixel remaster and mascot for each seat. The mascot seat follows <code>mascotLawyers</code> in roster.ts.</p>
      <div className={styles.lineup}>
        {(["A", "B"] as const).map(slot => {
          const art = lawyerArtFor(themeId, slot);
          const mascot = slot === "A" ? mascotA : mascotB;
          return <div key={slot} className={styles.seat}>
            <h3>Lawyer {slot} · {theme.lawyers[slot].displayName}</h3>
            <div className={styles.row}>
              <figure><div className={styles.sprite}><SidekickSprite assetId={art.classic} label={`${theme.lawyers[slot].displayName}, original drawing`}/></div><figcaption>Original</figcaption></figure>
              <figure><div className={styles.sprite}><PixelSprite assetId={art.remaster} label={`${theme.lawyers[slot].displayName}, pixel remaster`} reaction={reaction} frame={tick}/></div><figcaption>Remaster</figcaption></figure>
              <figure><div className={styles.sprite}><PixelSprite assetId={mascot} label={`${theme.lawyers[slot].displayName}, mascot`} reaction={reaction} frame={tick} accessories={accessories}/></div><figcaption>Mascot</figcaption></figure>
            </div>
          </div>;
        })}
      </div>
    </section>

    <section aria-labelledby="flash-title">
      <h2 id="flash-title">Reaction flashcards</h2>
      <p className={styles.note}>Each card is one frame. Reactions use 2–4 frames; the first card of each row is the live animation.</p>
      {[mascotA, mascotB, lawyerArtFor(themeId, "A").remaster, lawyerArtFor(themeId, "B").remaster].map(assetId => {
        const asset = getPixelAsset(assetId);
        return <div key={assetId} className={styles.flashGroup}>
          <h3>{asset.character.description}</h3>
          {reactions.map(item => <div key={item} className={styles.flashRow}>
            <span className={styles.flashLabel}>{item}</span>
            <figure className={styles.flashCard} data-live="true"><div className={styles.smallSprite}><PixelSprite assetId={assetId} label={`${item}, animated`} reaction={item} frame={tick} accessories={asset.kind === "mascot" ? accessories : false}/></div><figcaption>live</figcaption></figure>
            {Array.from({ length: asset.character.frames[item] }, (_, frame) => <figure key={frame} className={styles.flashCard}><div className={styles.smallSprite}><PixelSprite assetId={assetId} label={`${item} frame ${frame + 1}`} reaction={item} frame={frame} accessories={asset.kind === "mascot" ? accessories : false}/></div><figcaption>{frame + 1}/{asset.character.frames[item]}</figcaption></figure>)}
          </div>)}
        </div>;
      })}
    </section>

    <section aria-labelledby="size-title">
      <h2 id="size-title">Size comparison</h2>
      <p className={styles.note}>A 48-cell sprite only has even pixels when each cell covers a whole number of device pixels and the sprite starts on a device-pixel boundary. Odd sizes here are expected to fail.</p>
      <div className={styles.sizes}>{sizes.map(width => <SizeProbe key={width} width={width} assetId={mascotA} accessories={accessories}/>)}</div>
    </section>

    <section aria-labelledby="audit-title">
      <h2 id="audit-title">Pixel audit</h2>
      <div className={styles.tableWrap}><table className={styles.table}>
        <thead><tr><th scope="col">Asset</th><th scope="col">Theme</th><th scope="col">Colours</th><th scope="col">Frames</th><th scope="col">Mouth layer</th></tr></thead>
        <tbody>{pixelAssetIds.map(assetId => {
          const asset = getPixelAsset(assetId);
          const snapshot = renderPixelAsset(asset);
          const frameTotal = reactions.reduce((sum, item) => sum + asset.character.frames[item], 0);
          return <tr key={assetId}><td><code>{assetId}</code></td><td>{asset.theme}</td><td>{colorCount(snapshot)}</td><td>{frameTotal}</td><td>{snapshot.mouthRows.flat().some(Boolean) ? "Yes" : "Missing"}</td></tr>;
        })}</tbody>
      </table></div>
    </section>

    <section aria-labelledby="all-title">
      <h2 id="all-title">Every pixel asset</h2>
      <div className={styles.grid}>{pixelAssetIds.map(assetId => <figure key={assetId}><div className={styles.smallSprite}><PixelSprite assetId={assetId} label={getPixelAsset(assetId).character.description} reaction={reaction} frame={tick}/></div><figcaption>{assetId}</figcaption></figure>)}</div>
    </section>
  </div>;
}
