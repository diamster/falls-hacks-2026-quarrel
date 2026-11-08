"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import "./display-preferences.css";

export interface DisplayPreferences {
  pauseAnimations: boolean;
  reducedMotion: boolean;
  /** Play animations even when the device asks for reduced motion (the in-app Reduce motion still wins). */
  ignoreDeviceMotion: boolean;
  textSize: "standard" | "large";
}

export const displayPreferencesKey = "quarrel-display-preferences-v1";
export const defaultDisplayPreferences: Readonly<DisplayPreferences> = Object.freeze({
  pauseAnimations: false,
  reducedMotion: false,
  ignoreDeviceMotion: false,
  textSize: "standard",
});

function readPreferences(value: string | null): DisplayPreferences {
  try {
    const saved: unknown = value ? JSON.parse(value) : null;
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) return { ...defaultDisplayPreferences };
    const fields = saved as Record<string, unknown>;
    return {
      pauseAnimations: fields.pauseAnimations === true,
      reducedMotion: fields.reducedMotion === true,
      ignoreDeviceMotion: fields.ignoreDeviceMotion === true,
      textSize: fields.textSize === "large" ? "large" : "standard",
    };
  } catch {
    return { ...defaultDisplayPreferences };
  }
}

type DisplayPreferencesContextValue = {
  preferences: DisplayPreferences;
  updatePreferences: (patch: Partial<DisplayPreferences>) => void;
  storageAvailable: boolean;
};

const DisplayPreferencesContext = createContext<DisplayPreferencesContextValue | null>(null);

/** Browser-only presentation settings never enter a room mutation or clock calculation. */
export function DisplayPreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<DisplayPreferences>({ ...defaultDisplayPreferences });
  const [storageAvailable, setStorageAvailable] = useState(true);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try { setPreferences(readPreferences(window.localStorage.getItem(displayPreferencesKey))); }
    catch { setStorageAvailable(false); }
    setLoaded(true);
    function sync(event: StorageEvent) {
      if (event.key === displayPreferencesKey || event.key === null) {
        setPreferences(readPreferences(event.key === null ? null : event.newValue));
      }
    }
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      window.localStorage.setItem(displayPreferencesKey, JSON.stringify(preferences));
      setStorageAvailable(true);
    } catch { setStorageAvailable(false); }
  }, [loaded, preferences]);

  const updatePreferences = useCallback((patch: Partial<DisplayPreferences>) => {
    setPreferences(current => readPreferences(JSON.stringify({ ...current, ...patch })));
  }, []);

  return <DisplayPreferencesContext.Provider value={{ preferences, updatePreferences, storageAvailable }}>
    <div className="display-preferences" data-pause-animations={preferences.pauseAnimations} data-reduced-motion={preferences.reducedMotion} data-device-motion={preferences.ignoreDeviceMotion ? "ignore" : "follow"} data-text-size={preferences.textSize}>
      {children}
    </div>
  </DisplayPreferencesContext.Provider>;
}

export function useDisplayPreferences(): DisplayPreferencesContextValue {
  const context = useContext(DisplayPreferencesContext);
  if (!context) throw new Error("useDisplayPreferences requires DisplayPreferencesProvider.");
  return context;
}
