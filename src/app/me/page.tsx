import type { Metadata } from "next";
import { MeClient } from "@/components/clientOnly";

export const metadata: Metadata = { title: "Me" };

export default function MePage() {
  return (
    <main className="mx-auto max-w-2xl px-4 pb-32 md:pb-16">
      <MeClient />
    </main>
  );
}
