"use client";

import { useSyncExternalStore } from "react";
import { Segmented } from "./ui";

type Theme = "light" | "dark" | "system";
const KEY = "bs:theme";
const EVENT = "bs-theme";

function read(): Theme {
  try {
    const t = localStorage.getItem(KEY);
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

/** Appearance picker: Auto / Light / Dark (used on the Me page). */
export function ThemePicker() {
  const theme = useSyncExternalStore(subscribe, read, () => "system" as Theme);

  // The theme script in the layout applies it (and follows the system
  // setting while on "Auto") when it hears this event.
  function set(t: Theme) {
    try {
      localStorage.setItem(KEY, t);
    } catch {}
    window.dispatchEvent(new Event(EVENT));
  }

  return (
    <Segmented
      label="Appearance"
      value={theme}
      onChange={set}
      options={[
        { value: "system", label: "Auto" },
        { value: "light", label: "Light" },
        { value: "dark", label: "Dark" },
      ]}
    />
  );
}
