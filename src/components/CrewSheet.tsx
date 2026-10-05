"use client";

import { Check, History, Plus, Search, UsersRound } from "lucide-react";
import { useMemo, useState } from "react";
import { ensureFriend, getFriends, getGroups, getLastCrew } from "@/lib/client/friendsStore";
import { useLastSplitDates } from "@/lib/client/lastSplit";
import { getProfile } from "@/lib/client/profile";
import { ME_ID, sameAsLastTime, sortFriends, toPeople, withLastSplit, type Friend } from "@/lib/friends";
import type { Person } from "@/lib/types";
import { Avatar, ICON, Sheet, cx } from "./ui";

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
    <Sheet open={open} onClose={onClose} title="Who's eating with you?" confirmForm="crew-form" confirmLabel="Done">
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
  // Newest last split first, the same order as the Friends page.
  const lastSplit = useLastSplitDates();
  const list = sortFriends(withLastSplit(friends, lastSplit), query);
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
    <form
      id="crew-form"
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        confirm();
      }}
    >
      <div className="relative">
        <Search size={20} {...ICON} className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-ink-3" aria-hidden />
        <input
          className="input pl-11"
          placeholder="Search or add a name"
          aria-label="Search friends or add a new name"
          value={query}
          enterKeyHint="done"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            // Enter adds a new name; it never submits the whole sheet.
            e.preventDefault();
            if (query.trim() && !exact) addNew();
          }}
        />
      </div>

      {(last.length > 0 || groups.length > 0) && !query && (
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {last.length > 0 && (
            <button type="button" className="chip shrink-0" onClick={() => setPicked(new Set(last))}>
              <History size={18} {...ICON} aria-hidden /> Same as last time
            </button>
          )}
          {groups.map((g) => (
            <button
              key={g.id}
              type="button"
              className="chip shrink-0"
              onClick={() => setPicked((s) => new Set([...s, ...g.memberIds.filter((id) => friends.some((f) => f.id === id))]))}
            >
              <UsersRound size={18} {...ICON} aria-hidden /> {g.name}
            </button>
          ))}
        </div>
      )}

      <p className="px-5 text-[13px] text-ink-2" aria-live="polite">
        {picked.size + 1} {picked.size === 0 ? "person" : "people"}
      </p>

      <ul className="card rows overflow-hidden" aria-label="Friends">
        <li className="flex min-h-[56px] items-center gap-3 pr-4 pl-5">
          <Avatar person={{ name: me.name || "Me", emoji: me.emoji, color: me.color ?? "emerald" }} size={36} />
          <span className="flex-1 font-semibold">
            {me.name || "Me"} <span className="text-[13px] font-normal text-ink-2">(you)</span>
          </span>
          <span className="grid size-7 place-items-center rounded-full bg-accent text-accent-ink" aria-label="Always included">
            <Check size={16} {...ICON} />
          </span>
        </li>
        {query.trim() && !exact && (
          <li>
            <button
              type="button"
              onClick={addNew}
              className="flex min-h-[56px] w-full items-center gap-3 pr-4 pl-5 text-left hover:bg-[var(--hover)]"
            >
              <span className="grid size-9 place-items-center rounded-full bg-accent-soft text-accent">
                <Plus size={20} {...ICON} />
              </span>
              <span className="font-semibold text-accent">Add “{query.trim()}” to Friends</span>
            </button>
          </li>
        )}
        {list.map((f) => {
          const on = picked.has(f.id);
          return (
            <li key={f.id}>
              <label className="flex min-h-[56px] cursor-pointer items-center gap-3 pr-4 pl-5 hover:bg-[var(--hover)]">
                <Avatar person={f} size={36} />
                <span className="min-w-0 flex-1 truncate">{f.name}</span>
                <input type="checkbox" className="peer sr-only" checked={on} onChange={() => toggle(f.id)} />
                <span
                  aria-hidden
                  className={cx(
                    "grid size-7 place-items-center rounded-full peer-focus-visible:outline-2 peer-focus-visible:outline-accent",
                    on ? "bg-accent text-accent-ink" : "bg-[var(--field)]",
                  )}
                >
                  {on && <Check size={16} {...ICON} />}
                </span>
              </label>
            </li>
          );
        })}
        {friends.length === 0 && !query && (
          <li className="px-5 py-4 text-[15px] text-ink-2">
            No saved friends yet. Type a name above — they&apos;ll be saved for next time.
          </li>
        )}
      </ul>
    </form>
  );
}
