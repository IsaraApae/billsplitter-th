import { WizardClient } from "@/components/clientOnly";

export default function Home() {
  return (
    <main>
      {/* Server-rendered, so the poster paints before any JavaScript arrives. */}
      <div className="scene mast">
        <p className="display mast-title mx-auto max-w-2xl px-4">
          <span>Bill </span>
          <span>Splitter</span>
        </p>
      </div>
      <div className="pt-3">
        <WizardClient />
      </div>
    </main>
  );
}
