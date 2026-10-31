import type { CSSProperties, ReactNode } from "react";

/** Poster-size title, smaller as it gets longer, so a long bill name still fits. */
function titleSize(title: string) {
  const n = [...title].length;
  return n <= 10 ? 44 : n <= 18 ? 34 : n <= 30 ? 26 : 21;
}

/**
 * The top of a shared page: the scene, full width, with the title and total in
 * its clear sky. Everything below stays on calm panels.
 */
export function BillHeader({ details, title, children }: { details: ReactNode; title: string; children?: ReactNode }) {
  return (
    <header className="scene scene-bleed">
      <div className="mx-auto min-h-[250px] max-w-2xl px-5 pb-6 md:min-h-[360px]">
        <h1 className="display scene-title" style={{ "--t": titleSize(title) } as CSSProperties}>
          {title}
        </h1>
        {children}
        <p className="scene-sub mt-2">{details}</p>
      </div>
    </header>
  );
}

/** The pawn that walks along the wizard's steps. */
export function Pawn({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="12" cy="5.4" r="3.9" />
      <rect x="8.2" y="9.4" width="7.6" height="1.7" rx="0.85" />
      <path d="M10.3 11.1c0 3.2-1 5.5-2.800 7.300h9c-1.800-1.800-2.800-4.100-2.800-7.300z" />
      <rect x="5.300" y="19" width="13.400" height="3.200" rx="1.100" />
    </svg>
  );
}

/** What the pawn becomes on the last square. */
export function Queen({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="12" cy="1.900" r="1.500" />
      <circle cx="4.800" cy="3.700" r="1.300" />
      <circle cx="19.200" cy="3.700" r="1.300" />
      <path d="M4.800 5l3 3.600L9.300 4l2.700 4.700L14.700 4l1.500 4.600 3-3.600-1.900 6.800H6.700z" />
      <rect x="7.200" y="12.500" width="9.600" height="1.500" rx="0.750" />
      <path d="M10 14c0 1.800-.8 3.300-2.200 4.500h8.400C14.800 17.300 14 15.800 14 14z" />
      <rect x="5.300" y="19" width="13.400" height="3.200" rx="1.100" />
    </svg>
  );
}
