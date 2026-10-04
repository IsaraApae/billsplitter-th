import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { PayQrSource } from "@/components/PayQr";
import { SharedView } from "@/components/SharedView";
import { calculate } from "@/lib/calc";
import { formatMoney } from "@/lib/money";
import { effectiveQrMode } from "@/lib/promptpay";
import { getOwner, getPaid, isValidId, storageReady } from "@/lib/server/redis";
import { loadSplit } from "@/lib/server/splits";
import type { SplitDoc } from "@/lib/types";

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

/** Which QR to show: always the creator's *current* uploaded QR, or a generated one. */
async function resolveQr(doc: SplitDoc): Promise<PayQrSource | null> {
  const mode = effectiveQrMode(doc.payment, doc.currency);
  if (mode === "generate") return { mode, promptpay: doc.payment.promptpay };
  if (mode === "upload" && doc.payment.ownerId) {
    const owner = await getOwner(doc.payment.ownerId).catch(() => null);
    if (owner?.qrUrl) return { mode, ownerId: doc.payment.ownerId, version: owner.version };
  }
  return null;
}

export default async function SharedPage({ params }: PageProps<"/s/[id]">) {
  const { id } = await params;
  if (!isValidId(id)) notFound();
  if (!storageReady) {
    return (
      <main className="mx-auto max-w-2xl px-4 pb-32 md:pb-16">
        <div className="card p-8 text-center">
          <h1 className="text-[24px] font-bold tracking-tight">Sharing isn&apos;t set up yet</h1>
          <p className="mt-2 text-ink-2">The Redis database isn&apos;t connected to this deployment.</p>
          <Link href="/" className="btn-primary mt-5 h-12 px-6">
            Go home
          </Link>
        </div>
      </main>
    );
  }
  const s = await loadSplit(id);
  if (!s) notFound();
  const [paid, qr] = await Promise.all([getPaid(id).catch(() => []), resolveQr(s.doc)]);
  return <SharedView id={id} doc={s.doc} updatedAt={s.updatedAt} initialPaid={paid} qr={qr} />;
}
