import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-2xl p-4">
      <div className="card p-6 text-center">
        <p className="text-4xl">🧾</p>
        <h1 className="mt-2 text-xl font-bold">Split not found</h1>
        <p className="mt-2 text-zinc-500">This link is wrong or the split has expired (90 days after last activity).</p>
        <Link href="/" className="btn-primary mt-4">
          Start a new split
        </Link>
      </div>
    </main>
  );
}
