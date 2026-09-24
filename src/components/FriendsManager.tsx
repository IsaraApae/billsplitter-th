"use client";

import { Pencil, Plus, Trash2, UsersRound } from "lucide-react";
import { useState } from "react";
import { getFriends, getGroups, saveFriends, saveGroups } from "@/lib/client/friendsStore";
import { uid } from "@/lib/draft";
import { addFriend, findByName, sortFriends, type Friend, type FriendGroup } from "@/lib/friends";
import { PERSON_COLORS, type PersonColor } from "@/lib/types";
import { EmojiColorPicker } from "./MeSettings";
import { Avatar, Callout, Section, Sheet, cx } from "./ui";

type Editing = { kind: "friend"; friend: Friend | null } | { kind: "group"; group: FriendGroup | null } | null;

export function FriendsManager() {
  const [friends, setFriends] = useState<Friend[]>(getFriends);
  const [groups, setGroups] = useState<FriendGroup[]>(getGroups);
  const [editing, setEditing] = useState<Editing>(null);
  const [query, setQuery] = useState("");

  const commitFriends = (f: Friend[]) => {
    setFriends(f);
    saveFriends(f);
  };
  const commitGroups = (g: FriendGroup[]) => {
    setGroups(g);
    saveGroups(g);
  };

  function deleteFriend(f: Friend) {
    if (!confirm(`Delete ${f.name} from Friends? Existing splits aren't affected.`)) return;
    commitFriends(friends.filter((x) => x.id !== f.id));
    commitGroups(groups.map((g) => ({ ...g, memberIds: g.memberIds.filter((id) => id !== f.id) })));
    setEditing(null);
  }

  const list = sortFriends(friends, query);

  return (
    <div className="space-y-7">
      <div className="flex items-end justify-between gap-2">
        <h1 className="large-title">Friends</h1>
        <button type="button" className="btn-primary h-11" onClick={() => setEditing({ kind: "friend", friend: null })}>
          <Plus size={18} aria-hidden /> Add
        </button>
      </div>

      <Section
        title="Groups"
        action={
          friends.length > 1 && (
            <button type="button" className="btn-ghost px-3 text-[14px]" onClick={() => setEditing({ kind: "group", group: null })}>
              <Plus size={16} aria-hidden /> New group
            </button>
          )
        }
      >
        {groups.length === 0 ? (
          <p className="px-1 text-[14px] text-ink-2">
            Groups like “Office lunch” tick several friends at once when you start a split.
          </p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {groups.map((g) => (
              <li key={g.id}>
                <button
                  type="button"
                  className="chip glass-lite text-ink"
                  onClick={() => setEditing({ kind: "group", group: g })}
                >
                  <UsersRound size={16} aria-hidden /> {g.name}
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
          <ul className="card divide-y divide-[var(--line)] overflow-hidden">
            {list.map((f) => (
              <li key={f.id}>
                <button
                  type="button"
                  className="flex min-h-15 w-full items-center gap-3 px-4 py-2 text-left hover:bg-[var(--hover)]"
                  onClick={() => setEditing({ kind: "friend", friend: f })}
                >
                  <Avatar person={f} size={40} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{f.name}</span>
                    <span className="block text-[13px] text-ink-2">
                      {f.lastUsed ? `Last split ${new Date(f.lastUsed).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : "Not used yet"}
                    </span>
                  </span>
                  <Pencil size={16} className="text-ink-3" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Sheet
        open={editing?.kind === "friend"}
        onClose={() => setEditing(null)}
        title={editing?.kind === "friend" && editing.friend ? "Edit friend" : "New friend"}
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
          className="input text-[17px] font-semibold"
          placeholder="Name"
          aria-label="Name"
          maxLength={40}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      {duplicate && <Callout tone="warn">You already have a friend called {dup!.name}.</Callout>}
      <EmojiColorPicker emoji={emoji} color={color} onEmoji={setEmoji} onColor={setColor} />
      <div className="flex gap-2">
        {onDelete && (
          <button type="button" className="btn-secondary h-13 w-14 px-0 text-danger" aria-label="Delete friend" onClick={onDelete}>
            <Trash2 size={18} />
          </button>
        )}
        <button type="submit" className="btn-primary h-13 flex-1 text-[17px]" disabled={!name.trim() || duplicate}>
          Save
        </button>
      </div>
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
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim() || members.size === 0) return;
        onSave({ id: group?.id ?? uid(), name: name.trim().slice(0, 40), memberIds: [...members] });
      }}
    >
      <input
        autoFocus={!group}
        className="input text-[17px] font-semibold"
        placeholder="Group name, e.g. Office lunch"
        aria-label="Group name"
        maxLength={40}
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <ul className="space-y-1">
        {sortFriends(friends).map((f) => {
          const on = members.has(f.id);
          return (
            <li key={f.id}>
              <label className="flex min-h-13 cursor-pointer items-center gap-3 rounded-2xl px-2 hover:bg-[var(--hover)]">
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
                    "grid size-7 place-items-center rounded-full text-[15px] font-bold peer-focus-visible:ring-4 peer-focus-visible:ring-accent/30",
                    on ? "bg-accent text-accent-ink" : "shadow-[inset_0_0_0_2px_var(--field-border)]",
                  )}
                >
                  {on && "✓"}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      <div className="flex gap-2">
        {onDelete && (
          <button type="button" className="btn-secondary h-13 w-14 px-0 text-danger" aria-label="Delete group" onClick={onDelete}>
            <Trash2 size={18} />
          </button>
        )}
        <button type="submit" className="btn-primary h-13 flex-1 text-[17px]" disabled={!name.trim() || members.size === 0}>
          Save group
        </button>
      </div>
    </form>
  );
}
