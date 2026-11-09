import type { Metadata } from "next";
import { FastestRedirect } from "@/components/FastestRedirect";

export const metadata: Metadata = { title: "Who pays fastest" };

export default function FastestPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 pt-6 pb-6 md:pb-16">
      <FastestRedirect />
    </main>
  );
}
