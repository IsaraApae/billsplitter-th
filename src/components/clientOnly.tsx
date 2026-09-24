"use client";

import dynamic from "next/dynamic";

// These screens live entirely in localStorage, so they render on the client only.
export const WizardClient = dynamic(() => import("./wizard/Wizard").then((m) => m.Wizard), {
  ssr: false,
  loading: () => <div className="mx-auto h-dvh max-w-2xl" />,
});

export const HistoryClient = dynamic(() => import("./HistoryList").then((m) => m.HistoryList), { ssr: false });
