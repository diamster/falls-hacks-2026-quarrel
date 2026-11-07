import { themes, type ThemeId } from "@/themes";
import { ThemePreview } from "./theme-preview";
import { useEffect, useRef, type KeyboardEvent } from "react";

export function ThemeSelector({ selectedId, canEdit, pending, locked, hasRoom, onSelect }: {
  selectedId: ThemeId; canEdit: boolean; pending: boolean; locked: boolean; hasRoom: boolean;
  onSelect: (id: ThemeId) => void;
}) {
  const group = useRef<HTMLDivElement>(null);
  const keyboardTarget = useRef<ThemeId | null>(null);
  useEffect(() => {
    if (!pending && keyboardTarget.current) {
      if (keyboardTarget.current === selectedId) group.current?.querySelector<HTMLButtonElement>(`[data-theme-option="${selectedId}"]`)?.focus();
      keyboardTarget.current = null;
    }
  }, [pending, selectedId]);
  function navigate(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const steps: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
    let next: number;
    if (event.key === "Home") next = 0;
    else if (event.key === "End") next = themes.length - 1;
    else if (Object.hasOwn(steps, event.key)) next = (index + steps[event.key] + themes.length) % themes.length;
    else return;
    event.preventDefault();
    const id = themes[next].id;
    keyboardTarget.current = id !== selectedId ? id : null;
    group.current?.querySelector<HTMLButtonElement>(`[data-theme-option="${id}"]`)?.focus();
    if (id !== selectedId) onSelect(id);
  }
  const explanation = !hasRoom ? "Create a room to choose its setting. Your guest will see the same world."
    : locked ? "This room’s setting is locked."
    : canEdit ? "As Player A, you choose the setting for both players. You can change it while you’re in the lobby."
    : "Player A chooses the setting. Changes appear here automatically.";
  return <section className="theme-selector pixel-panel" aria-labelledby="theme-selector-title">
    <div className="theme-selector-heading"><div><p className="eyebrow">FOUR WORLDS. ONE FAIR HEARING.</p><h2 id="theme-selector-title">Choose the setting</h2></div><p id="theme-selection-help">{explanation}</p></div>
    <div ref={group} className="theme-grid" role="radiogroup" aria-label="Room theme" aria-describedby="theme-selection-help" aria-busy={pending}>
      {themes.map((theme, index) => <button key={theme.id} type="button" role="radio" aria-checked={theme.id === selectedId} aria-label={`${theme.displayName} theme`} className="theme-card" data-theme-option={theme.id} data-selected={theme.id === selectedId} tabIndex={theme.id === selectedId ? 0 : -1} disabled={!canEdit || pending || locked} onKeyDown={event => navigate(event, index)} onClick={() => { if (theme.id !== selectedId) onSelect(theme.id); }}>
        <ThemePreview theme={theme}/><span className="theme-card-selection">{theme.id === selectedId ? "✓ Selected" : canEdit ? "Choose theme" : "Preview"}</span>
      </button>)}
    </div>
  </section>;
}
