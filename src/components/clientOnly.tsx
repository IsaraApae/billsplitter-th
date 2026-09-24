"use client";

import dynamic from "next/dynamic";

// These screens live entirely in localStorage, so they render on the client only.
const blank = () => <div className="mx-auto h-dvh max-w-2xl" />;

export const WizardClient = dynamic(() => import("./wizard/Wizard").then((m) => m.Wizard), { ssr: false, loading: blank });
export const HistoryClient = dynamic(() => import("./HistoryList").then((m) => m.HistoryList), { ssr: false });
export const MeClient = dynamic(() => import("./MeSettings").then((m) => m.MeSettings), { ssr: false, loading: blank });
export const FriendsClient = dynamic(() => import("./FriendsManager").then((m) => m.FriendsManager), {
  ssr: false,
  loading: blank,
});
