import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-2xl p-4 pt-8">
      <div className="glass rounded-[28px] p-8 text-center">
        <p className="text-5xl">🧾</p>
        <h1 className="mt-3 text-[24px] font-bold tracking-tight">Split not found</h1>
        <p className="mt-2 text-ink-2">This link is wrong or the split has expired (90 days after last activity).</p>
        <Link href="/" className="btn-primary mt-5 h-12">
          Start a new split
        </Link>
      </div>
    </main>
  );
}
