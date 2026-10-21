"use client";

import { ChevronRight, HandCoins, Wallet } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { getHistory, getSeen } from "@/lib/client/storage";
import { owedToYou } from "@/lib/owed";
import { ICON, Money } from "./ui";

/** At the top of History: "Owed to you" (when friends owe you) and "What I owe" (always, so friends can find it). */
export function OwedLinks() {
  const [owed] = useState(() => {
    const friends = owedToYou(getHistory());
    const thb = friends.filter((f) => f.currency === "THB").reduce((s, f) => s + f.total, 0);
    return { thb, people: new Set(friends.map((f) => f.key)).size };
  });
  const [seen] = useState(() => getSeen().length);
  return (
    <ul className="card rows overflow-hidden">
      {owed.people > 0 && (
        <li>
          <Link href="/owed" className="flex min-h-[60px] items-center gap-3 py-2 pr-3 pl-5">
            <HandCoins size={22} {...ICON} className="shrink-0 text-accent" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">Owed to you</span>
              <span className="block text-[13px] text-ink-2">
                {owed.people} {owed.people === 1 ? "friend" : "friends"} still to pay
              </span>
            </span>
            {owed.thb > 0 && <Money value={owed.thb} currency="THB" className="text-[17px] font-bold tracking-tight" />}
            <ChevronRight size={20} {...ICON} className="shrink-0 text-ink-3" aria-hidden />
          </Link>
        </li>
      )}
      <li>
        <Link href="/owe" className="flex min-h-[60px] items-center gap-3 py-2 pr-3 pl-5">
          <Wallet size={22} {...ICON} className="shrink-0 text-accent" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">What I owe</span>
            <span className="block text-[13px] text-ink-2">
              {seen > 0
                ? `${seen} ${seen === 1 ? "bill" : "bills"} friends shared with you`
                : "Bills friends send you, once you open them here"}
            </span>
          </span>
          <ChevronRight size={20} {...ICON} className="shrink-0 text-ink-3" aria-hidden />
        </Link>
      </li>
    </ul>
  );
}
