import { ChevronRight, Trophy } from "lucide-react";
import Link from "next/link";
import { ICON } from "./ui";

/** A row that opens "Who pays fastest" (the organiser's, or a shared list's). */
export function FastestLink({ href = "/fastest", detail = "Friends ranked by how fast they pay you" }: { href?: string; detail?: string }) {
  return (
    <Link href={href} className="flex min-h-[60px] items-center gap-3 py-2 pr-3 pl-5">
      <Trophy size={22} {...ICON} className="shrink-0 text-accent" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">Who pays fastest</span>
        <span className="block text-[13px] text-ink-2">{detail}</span>
      </span>
      <ChevronRight size={20} {...ICON} className="shrink-0 text-ink-3" aria-hidden />
    </Link>
  );
}
