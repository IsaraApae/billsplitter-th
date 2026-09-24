import type { Metadata } from "next";
import { HistoryClient } from "@/components/clientOnly";

export const metadata: Metadata = { title: "History" };

export default function HistoryPage() {
  return (
    <main className="mx-auto max-w-2xl space-y-4 px-4 pt-4 pb-16">
      <h1 className="text-2xl font-bold tracking-tight">Recent splits</h1>
      <HistoryClient />
    </main>
  );
}
