import type { Metadata } from "next";
import { WhatIOweClient } from "@/components/clientOnly";

export const metadata: Metadata = { title: "What I owe" };

export default function WhatIOwePage() {
  return (
    <main className="mx-auto max-w-2xl space-y-5 px-4 pb-6 md:pb-16">
      <h1 className="large-title">What I owe</h1>
      <WhatIOweClient />
    </main>
  );
}
