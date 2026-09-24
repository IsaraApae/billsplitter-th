"use client";

import { Clock3, UserRound, UsersRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "./ui";

const LINKS = [
  { href: "/history", label: "History", Icon: Clock3 },
  { href: "/friends", label: "Friends", Icon: UsersRound },
  { href: "/me", label: "Me", Icon: UserRound },
];

export function NavLinks() {
  const path = usePathname();
  return (
    <nav aria-label="Main" className="ml-auto flex items-center gap-0.5">
      {LINKS.map(({ href, label, Icon }) => {
        const active = path === href;
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cx(
              "flex min-h-11 min-w-11 flex-col items-center justify-center rounded-full px-2 text-[11px] font-semibold transition-colors sm:flex-row sm:gap-1.5 sm:px-3 sm:text-sm",
              active ? "bg-accent-soft text-accent-strong" : "text-ink-2 hover:bg-[var(--hover)]",
            )}
          >
            <Icon size={20} strokeWidth={2.2} aria-hidden />
            <span className="leading-tight">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
