import { Layers } from "lucide-react";
import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-2xl px-4 pt-4 pb-32 md:pb-16">
      <div className="card p-8 text-center">
        <div className="mx-auto mb-4 grid size-14 place-items-center rounded-full bg-accent-soft text-accent">
          <Layers size={28} strokeWidth={2} aria-hidden />
        </div>
        <h1 className="text-[24px] font-bold tracking-tight">Big bill not found</h1>
        <p className="mt-2 text-ink-2">This link is wrong or the big bill has expired (90 days after last activity).</p>
        <Link href="/history" className="btn-primary mt-5 h-12 px-6">
          Go to History
        </Link>
      </div>
    </main>
  );
}
