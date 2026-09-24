"use client";

import { useEffect, useSyncExternalStore } from "react";
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

function apply(t: Theme) {
  const dark = t === "dark" || (t === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

/** Appearance picker: Auto / Light / Dark (used on the Me page). */
export function ThemePicker() {
  const theme = useSyncExternalStore(subscribe, read, () => "system" as Theme);

  // Follow the OS setting while in "Auto".
  useEffect(() => {
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply(read());
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  function set(t: Theme) {
    try {
      localStorage.setItem(KEY, t);
    } catch {}
    apply(t);
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
