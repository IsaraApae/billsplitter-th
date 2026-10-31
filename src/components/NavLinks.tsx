"use client";

import { Camera, Clock3, House, UserRound, UsersRound } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useRef } from "react";
import { setPendingScan } from "@/lib/client/pendingScan";
import { ICON, cx } from "./ui";

const LINKS = [
  { href: "/", label: "Home", Icon: House },
  { href: "/history", label: "History", Icon: Clock3 },
  { href: "/friends", label: "Friends", Icon: UsersRound },
  { href: "/me", label: "Me", Icon: UserRound },
];

/**
 * The bar across the screen (bottom on phones, top on desktop) with "Scan receipt" as a separate
 * filled green square beside it. Routes are fetched on first touch or hover
 * rather than all at once on every page load.
 */
export function NavLinks() {
  const path = usePathname();
  const router = useRouter();
  const cameraRef = useRef<HTMLInputElement>(null);

  return (
    <div className="dock fixed inset-x-0 bottom-0 z-50 md:top-0 md:bottom-auto">
      <div className="mx-auto flex max-w-2xl items-center gap-2.5 px-3 py-1.5">
        <nav aria-label="Main" className="flex h-[62px] flex-1 items-center justify-around">
          {LINKS.map(({ href, label, Icon }) => {
            const active = href === "/" ? path === "/" : path.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                prefetch={false}
                onPointerEnter={() => router.prefetch(href)}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "press flex h-[52px] min-w-[64px] flex-1 flex-col items-center justify-center gap-0.5 rounded-[var(--r)] text-[11px] font-semibold md:flex-row md:gap-2 md:text-[15px]",
                  active ? "bg-accent-soft text-accent-strong" : "text-ink-2",
                )}
              >
                <Icon size={22} {...ICON} aria-hidden />
                <span className="leading-none">{label}</span>
              </Link>
            );
          })}
        </nav>
        <button
          type="button"
          aria-label="Scan receipt"
          className="press grid size-[62px] shrink-0 place-items-center rounded-[8px] bg-accent-fill text-accent-ink shadow-[var(--raised-shadow)]"
          onClick={() => cameraRef.current?.click()}
        >
          <Camera size={24} {...ICON} aria-hidden />
        </button>
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            setPendingScan(file);
            if (path !== "/") router.push("/");
          }}
        />
      </div>
    </div>
  );
}
