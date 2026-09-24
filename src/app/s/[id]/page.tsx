import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SharedView } from "@/components/SharedView";
import { calculate } from "@/lib/calc";
import { formatMoney } from "@/lib/money";
import { getPaid, isValidId, storageReady } from "@/lib/server/redis";
import { loadSplit } from "@/lib/server/splits";

export async function generateMetadata({ params }: PageProps<"/s/[id]">): Promise<Metadata> {
  const { id } = await params;
  const s = await loadSplit(id);
  if (!s) return { title: "Split not found", robots: { index: false } };
  const c = calculate(s.doc);
  const n = s.doc.people.length;
  const description = `${formatMoney(c.total, s.doc.currency)} split between ${n} ${n === 1 ? "person" : "people"}. Tap to see what you owe and mark it paid.`;
  return {
    title: s.doc.title,
    description,
    robots: { index: false, follow: false },
    openGraph: { title: s.doc.title, description, type: "website", siteName: "Bill Splitter" },
    twitter: { card: "summary_large_image", title: s.doc.title, description },
  };
}

export default async function SharedPage({ params }: PageProps<"/s/[id]">) {
  const { id } = await params;
  if (!isValidId(id)) notFound();
  if (!storageReady) {
    return (
      <main className="mx-auto max-w-2xl p-4">
        <div className="card p-6 text-center">
          <h1 className="text-xl font-bold">Sharing isn&apos;t set up yet</h1>
          <p className="mt-2 text-zinc-500">The Redis database isn&apos;t connected to this deployment.</p>
          <Link href="/" className="btn-primary mt-4">
            Go home
          </Link>
        </div>
      </main>
    );
  }
  const s = await loadSplit(id);
  if (!s) notFound();
  const paid = await getPaid(id).catch(() => []);
  return <SharedView id={id} doc={s.doc} updatedAt={s.updatedAt} initialPaid={paid} />;
}
