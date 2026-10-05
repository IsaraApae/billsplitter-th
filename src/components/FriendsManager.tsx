"use client";

import { Check, ChevronRight, Pencil, Plus, Trash2, UsersRound } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { askConfirm } from "@/lib/client/confirm";
import { getFriends, getGroups, saveFriends, saveGroups } from "@/lib/client/friendsStore";
import { useLastSplitDates, useSplitHistory } from "@/lib/client/lastSplit";
import { uid } from "@/lib/draft";
import { addFriend, findByName, sortFriends, withLastSplit, type Friend, type FriendGroup } from "@/lib/friends";
import { PERSON_COLORS, type PersonColor } from "@/lib/types";
import { EmojiColorPicker } from "./MeSettings";
import { Avatar, Callout, ICON, Section, Sheet, cx } from "./ui";

type Editing = { kind: "friend"; friend: Friend | null } | { kind: "group"; group: FriendGroup | null } | null;

export function FriendsManager() {
  const [friends, setFriends] = useState<Friend[]>(getFriends);
  const [groups, setGroups] = useState<FriendGroup[]>(getGroups);
  const [editing, setEditing] = useState<Editing>(null);
  const [query, setQuery] = useState("");

  const lastSplit = useLastSplitDates(useSplitHistory());

  const commitFriends = (f: Friend[]) => {
    setFriends(f);
    saveFriends(f);
  };
  const commitGroups = (g: FriendGroup[]) => {
    setGroups(g);
    saveGroups(g);
  };

  async function deleteFriend(f: Friend) {
    const ok = await askConfirm({
      title: `Delete ${f.name}?`,
      message: "Existing splits aren't affected.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    commitFriends(friends.filter((x) => x.id !== f.id));
    commitGroups(groups.map((g) => ({ ...g, memberIds: g.memberIds.filter((id) => id !== f.id) })));
    setEditing(null);
  }

  // "Last split" = the newest bill date among saved splits this friend is in.
  const list = sortFriends(withLastSplit(friends, lastSplit), query);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <h1 className="large-title">Friends</h1>
        <button
          type="button"
          className="icon-btn"
          aria-label="Add friend"
          onClick={() => setEditing({ kind: "friend", friend: null })}
        >
          <Plus size={22} {...ICON} />
        </button>
      </div>

      <Section
        title="Groups"
        action={
          friends.length > 1 && (
            <button type="button" className="btn-ghost min-h-8 px-0 text-[15px]" onClick={() => setEditing({ kind: "group", group: null })}>
              <Plus size={18} {...ICON} aria-hidden /> New group
            </button>
          )
        }
      >
        {groups.length === 0 ? (
          <p className="px-5 text-[15px] text-ink-2">
            Groups like “Office lunch” tick several friends at once when you start a split.
          </p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {groups.map((g) => (
              <li key={g.id}>
                <button
                  type="button"
                  className="chip"
                  onClick={() => setEditing({ kind: "group", group: g })}
                >
                  <UsersRound size={18} {...ICON} aria-hidden /> {g.name}
                  <span className="text-[13px] text-ink-2">{g.memberIds.length}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={`People${friends.length ? ` · ${friends.length}` : ""}`}>
        {friends.length > 6 && (
          <input
            className="input"
            placeholder="Search friends"
            aria-label="Search friends"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        )}
        {friends.length === 0 ? (
          <div className="card p-6 text-center text-[15px] text-ink-2">
            Add the people you often eat with. They&apos;re saved on this device and appear in “Who&apos;s eating
            with you?” when you start a split.
          </div>
        ) : (
          <ul className="card rows overflow-hidden">
            {list.map((f) => (
              <li key={f.id} className="relative flex min-h-[60px] items-center gap-1 py-2 pr-2 pl-5 hover:bg-[var(--hover)]">
                <Avatar person={f} size={40} />
                <span className="ml-2 min-w-0 flex-1">
                  {/* Tapping the row shows their splits; the link's ::after covers it. */}
                  <Link
                    href={`/history?person=${encodeURIComponent(f.id)}`}
                    className="block truncate font-semibold outline-none after:absolute after:inset-0 after:content-[''] focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-accent"
                  >
                    {f.name}
                  </Link>
                  <span className="block text-[13px] text-ink-2">
                    {f.lastUsed ? `Last split ${new Date(f.lastUsed).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : "Not used yet"}
                  </span>
                </span>
                <button
                  type="button"
                  className="icon-plain relative z-10 size-11"
                  aria-label={`Edit ${f.name}`}
                  onClick={() => setEditing({ kind: "friend", friend: friends.find((x) => x.id === f.id) ?? f })}
                >
                  <Pencil size={20} {...ICON} />
                </button>
                <ChevronRight size={20} {...ICON} className="shrink-0 text-ink-3" aria-hidden />
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Sheet
        open={editing?.kind === "friend"}
        onClose={() => setEditing(null)}
        title={editing?.kind === "friend" && editing.friend ? "Edit friend" : "New friend"}
        confirmForm="friend-form"
        confirmLabel="Save"
      >
        {editing?.kind === "friend" && (
          <FriendForm
            friend={editing.friend}
            existing={friends}
            onSave={(f) => {
              if (editing.friend) commitFriends(friends.map((x) => (x.id === f.id ? f : x)));
              else commitFriends(addFriend(friends, f, f.id).friends);
              setEditing(null);
            }}
            onDelete={editing.friend ? () => deleteFriend(editing.friend!) : undefined}
          />
        )}
      </Sheet>

      <Sheet
        open={editing?.kind === "group"}
        onClose={() => setEditing(null)}
        title={editing?.kind === "group" && editing.group ? "Edit group" : "New group"}
        confirmForm="group-form"
        confirmLabel="Save group"
      >
        {editing?.kind === "group" && (
          <GroupForm
            group={editing.group}
            friends={friends}
            onSave={(g) => {
              commitGroups(editing.group ? groups.map((x) => (x.id === g.id ? g : x)) : [...groups, g]);
              setEditing(null);
            }}
            onDelete={
              editing.group
                ? () => {
                    commitGroups(groups.filter((x) => x.id !== editing.group!.id));
                    setEditing(null);
                  }
                : undefined
            }
          />
        )}
      </Sheet>
    </div>
  );
}

function FriendForm({
  friend,
  existing,
  onSave,
  onDelete,
}: {
  friend: Friend | null;
  existing: Friend[];
  onSave: (f: Friend) => void;
  onDelete?: () => void;
}) {
  const [name, setName] = useState(friend?.name ?? "");
  const [emoji, setEmoji] = useState(friend?.emoji);
  const [color, setColor] = useState<PersonColor>(friend?.color ?? PERSON_COLORS[existing.length % PERSON_COLORS.length]);
  const dup = findByName(existing, name);
  const duplicate = !!dup && dup.id !== friend?.id;

  return (
    <form
      id="friend-form"
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim() || duplicate) return;
        onSave({ id: friend?.id ?? uid(), name: name.trim().slice(0, 40), emoji, color, lastUsed: friend?.lastUsed ?? 0 });
      }}
    >
      <div className="flex items-center gap-3">
        <Avatar person={{ name: name || "?", emoji, color }} size={52} />
        <input
          autoFocus={!friend}
          required
          className="input font-semibold"
          placeholder="Name"
          aria-label="Name"
          maxLength={40}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      {duplicate && <Callout tone="warn">You already have a friend called {dup!.name}.</Callout>}
      <EmojiColorPicker emoji={emoji} color={color} onEmoji={setEmoji} onColor={setColor} />
      {onDelete && (
        <button type="button" className="btn-secondary h-12 w-full" onClick={onDelete}>
          <Trash2 size={20} {...ICON} aria-hidden /> Delete friend
        </button>
      )}
    </form>
  );
}

function GroupForm({
  group,
  friends,
  onSave,
  onDelete,
}: {
  group: FriendGroup | null;
  friends: Friend[];
  onSave: (g: FriendGroup) => void;
  onDelete?: () => void;
}) {
  const [name, setName] = useState(group?.name ?? "");
  const [members, setMembers] = useState<Set<string>>(new Set(group?.memberIds ?? []));
  return (
    <form
      id="group-form"
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim() || members.size === 0) return;
        onSave({ id: group?.id ?? uid(), name: name.trim().slice(0, 40), memberIds: [...members] });
      }}
    >
      <input
        autoFocus={!group}
        required
        className="input font-semibold"
        placeholder="Group name, e.g. Office lunch"
        aria-label="Group name"
        maxLength={40}
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <ul className="card rows overflow-hidden">
        {sortFriends(friends).map((f) => {
          const on = members.has(f.id);
          return (
            <li key={f.id}>
              <label className="flex min-h-[56px] cursor-pointer items-center gap-3 pr-4 pl-5 hover:bg-[var(--hover)]">
                <Avatar person={f} size={34} />
                <span className="flex-1 truncate font-medium">{f.name}</span>
                <input
                  type="checkbox"
                  className="peer sr-only"
                  checked={on}
                  onChange={() =>
                    setMembers((s) => {
                      const n = new Set(s);
                      if (on) n.delete(f.id);
                      else n.add(f.id);
                      return n;
                    })
                  }
                />
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
      </ul>
      {members.size === 0 && <p className="px-5 text-[13px] text-ink-2">Tick at least one friend.</p>}
      {onDelete && (
        <button type="button" className="btn-secondary h-12 w-full" onClick={onDelete}>
          <Trash2 size={20} {...ICON} aria-hidden /> Delete group
        </button>
      )}
    </form>
  );
}
