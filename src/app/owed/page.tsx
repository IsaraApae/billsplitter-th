import type { Metadata } from "next";
import { OwedToYouClient } from "@/components/clientOnly";

export const metadata: Metadata = { title: "Owed to you" };

export default function OwedToYouPage() {
  return (
    <main className="mx-auto max-w-2xl space-y-5 px-4 pb-32 md:pb-16">
      <h1 className="large-title">Owed to you</h1>
      <OwedToYouClient />
    </main>
  );
}
