"use client";

import { Check, History, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { ensureFriend, getFriends, getGroups, getLastCrew } from "@/lib/client/friendsStore";
import { getProfile } from "@/lib/client/profile";
import { ME_ID, sameAsLastTime, sortFriends, toPeople, type Friend } from "@/lib/friends";
import type { Person } from "@/lib/types";
import { Avatar, Sheet, cx } from "./ui";

/**
 * "Who's eating with you?" — pick saved friends for a split. "Me" is always
 * included. People already in the split who aren't saved friends are kept.
 */
export function CrewSheet({
  open,
  onClose,
  people,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  people: Person[];
  onConfirm: (people: Person[]) => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} title="Who's eating with you?">
      {/* Re-mounts on open so it always starts from the split's current people. */}
      {open && <CrewPicker people={people} onConfirm={onConfirm} />}
    </Sheet>
  );
}

function CrewPicker({ people, onConfirm }: { people: Person[]; onConfirm: (people: Person[]) => void }) {
  const [friends, setFriends] = useState<Friend[]>(getFriends);
  const [groups] = useState(getGroups);
  const last = useMemo(() => sameAsLastTime(friends, getLastCrew()), [friends]);
  const [picked, setPicked] = useState<Set<string>>(
    () => new Set(people.filter((p) => friends.some((f) => f.id === p.id)).map((p) => p.id)),
  );
  const [query, setQuery] = useState("");
  const me = getProfile();
  const list = sortFriends(friends, query);
  const exact = friends.some((f) => f.name.trim().toLocaleLowerCase() === query.trim().toLocaleLowerCase());

  const toggle = (id: string) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  function addNew() {
    const name = query.trim();
    if (!name) return;
    const f = ensureFriend({ name });
    setFriends(getFriends());
    setPicked((s) => new Set(s).add(f.id));
    setQuery("");
  }

  function confirm() {
    const chosen = friends.filter((f) => picked.has(f.id));
    // Keep anyone in the split who isn't a saved friend (e.g. from an older split).
    const others = people.filter((p) => p.id !== ME_ID && !friends.some((f) => f.id === p.id));
    const existingMe = people.find((p) => p.id === ME_ID);
    const [meP, ...rest] = toPeople({ name: existingMe?.name || me.name, emoji: me.emoji, color: me.color }, chosen);
    onConfirm([meP, ...rest, ...others]);
  }

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search size={18} className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-ink-3" aria-hidden />
        <input
          className="input pl-11"
          placeholder="Search or add a name"
          aria-label="Search friends or add a new name"
          value={query}
          enterKeyHint="done"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && query.trim() && !exact) {
              e.preventDefault();
              addNew();
            }
          }}
        />
      </div>

      {(last.length > 0 || groups.length > 0) && !query && (
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {last.length > 0 && (
            <button type="button" className="chip glass-lite shrink-0 text-ink" onClick={() => setPicked(new Set(last))}>
              <History size={16} aria-hidden /> Same as last time
            </button>
          )}
          {groups.map((g) => (
            <button
              key={g.id}
              type="button"
              className="chip glass-lite shrink-0 text-ink"
              onClick={() => setPicked((s) => new Set([...s, ...g.memberIds.filter((id) => friends.some((f) => f.id === id))]))}
            >
              {g.name}
            </button>
          ))}
        </div>
      )}

      <ul className="space-y-1.5" aria-label="Friends">
        <li>
          <div className="flex min-h-14 items-center gap-3 rounded-2xl bg-accent-soft px-3">
            <Avatar person={{ name: me.name || "Me", emoji: me.emoji, color: me.color ?? "emerald" }} size={36} />
            <span className="flex-1 font-semibold">
              {me.name || "Me"} <span className="text-[13px] font-medium text-ink-2">(you)</span>
            </span>
            <span className="grid size-7 place-items-center rounded-full bg-accent text-accent-ink" aria-label="Always included">
              <Check size={16} strokeWidth={3} />
            </span>
          </div>
        </li>
        {query.trim() && !exact && (
          <li>
            <button
              type="button"
              onClick={addNew}
              className="flex min-h-14 w-full items-center gap-3 rounded-2xl px-3 text-left hover:bg-[var(--hover)]"
            >
              <span className="grid size-9 place-items-center rounded-full bg-accent-soft text-accent-strong">
                <Plus size={20} />
              </span>
              <span className="font-semibold text-accent">Add “{query.trim()}” to Friends</span>
            </button>
          </li>
        )}
        {list.map((f) => {
          const on = picked.has(f.id);
          return (
            <li key={f.id}>
              <label className="flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl px-3 hover:bg-[var(--hover)]">
                <Avatar person={f} size={36} />
                <span className="min-w-0 flex-1 truncate font-medium">{f.name}</span>
                <input type="checkbox" className="peer sr-only" checked={on} onChange={() => toggle(f.id)} />
                <span
                  aria-hidden
                  className={cx(
                    "grid size-7 place-items-center rounded-full transition-colors peer-focus-visible:ring-4 peer-focus-visible:ring-accent/30",
                    on ? "bg-accent text-accent-ink" : "shadow-[inset_0_0_0_2px_var(--field-border)]",
                  )}
                >
                  {on && <Check size={16} strokeWidth={3} />}
                </span>
              </label>
            </li>
          );
        })}
        {friends.length === 0 && !query && (
          <li className="px-3 py-2 text-[14px] text-ink-2">
            No saved friends yet. Type a name above — they&apos;ll be saved for next time.
          </li>
        )}
      </ul>

      <div className="sticky bottom-0 -mx-5 -mb-5 bg-gradient-to-t from-[var(--glass-strong)] via-[var(--glass-strong)] to-transparent px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <button type="button" className="btn-primary h-14 w-full text-[17px]" onClick={confirm}>
          Done · {picked.size + 1} {picked.size === 0 ? "person" : "people"}
        </button>
      </div>
    </div>
  );
}
