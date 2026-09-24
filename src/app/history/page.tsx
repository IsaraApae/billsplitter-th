import type { Metadata } from "next";
import { HistoryClient } from "@/components/clientOnly";

export const metadata: Metadata = { title: "History" };

export default function HistoryPage() {
  return (
    <main className="mx-auto max-w-2xl space-y-5 px-4 pt-5 pb-16">
      <h1 className="large-title">History</h1>
      <HistoryClient />
    </main>
  );
}
