// Backup file for moving to a new phone: everything this device keeps in
// localStorage except the current draft and display settings. Pure.

export const BACKUP_KEYS = [
  "bs:profile",
  "bs:friends",
  "bs:groups",
  "bs:history",
  "bs:events",
  "bs:tokens",
  "bs:lastCrew",
] as const;
export type BackupKey = (typeof BACKUP_KEYS)[number];
export type BackupData = Partial<Record<BackupKey, unknown>>;

export interface Backup {
  app: "bill-splitter";
  version: 1;
  exportedAt: string;
  data: BackupData;
}

export function makeBackup(data: BackupData, now = new Date()): Backup {
  return { app: "bill-splitter", version: 1, exportedAt: now.toISOString(), data };
}

type WithId = { id: string };
const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const idList = (v: unknown): WithId[] =>
  Array.isArray(v) ? v.filter((x): x is WithId => isObject(x) && typeof x.id === "string") : [];

/** The backup in a file's text, or null if it isn't one of ours. */
export function parseBackup(text: string): Backup | null {
  try {
    const b = JSON.parse(text);
    if (!isObject(b) || b.app !== "bill-splitter" || b.version !== 1 || !isObject(b.data)) return null;
    const data: BackupData = {};
    for (const k of BACKUP_KEYS) if (k in b.data) data[k] = b.data[k];
    return { app: "bill-splitter", version: 1, exportedAt: String(b.exportedAt ?? ""), data };
  } catch {
    return null;
  }
}

/** Items from both lists, matched by id; this device's copy wins. */
function union(current: unknown, incoming: unknown): WithId[] {
  const mine = idList(current);
  const ids = new Set(mine.map((x) => x.id));
  return [...mine, ...idList(incoming).filter((x) => !ids.has(x.id))];
}

function emptyProfile(p: unknown): boolean {
  return !isObject(p) || (!p.name && !p.promptpay && !p.note && !p.ownerId);
}

/**
 * Restoring adds what's missing and keeps what's here: splits, friends and
 * groups are merged by id, and edit rights are added. The Me settings come
 * from the backup when this device has none (a new phone); otherwise they're
 * kept, but an uploaded QR from the backup is adopted if this device has none.
 */
export function mergeBackup(current: BackupData, incoming: BackupData): BackupData {
  const cur = current["bs:profile"];
  const inc = incoming["bs:profile"];
  let profile = cur ?? inc;
  if (emptyProfile(cur) && isObject(inc)) profile = inc;
  else if (isObject(cur) && !cur.ownerId && isObject(inc) && inc.ownerId) {
    const { ownerId, ownerToken, qrVersion } = inc;
    profile = { ...cur, ownerId, ownerToken, qrVersion, qrMode: cur.qrMode === "none" ? inc.qrMode : cur.qrMode };
  }
  return {
    "bs:profile": profile,
    "bs:friends": union(current["bs:friends"], incoming["bs:friends"]),
    "bs:groups": union(current["bs:groups"], incoming["bs:groups"]),
    "bs:history": union(current["bs:history"], incoming["bs:history"]),
    "bs:events": union(current["bs:events"], incoming["bs:events"]),
    "bs:tokens": {
      ...(isObject(incoming["bs:tokens"]) ? incoming["bs:tokens"] : {}),
      ...(isObject(current["bs:tokens"]) ? current["bs:tokens"] : {}),
    },
    "bs:lastCrew": current["bs:lastCrew"] ?? incoming["bs:lastCrew"],
  };
}

/** For the confirmation: how much the backup holds. */
export function backupSummary(b: Backup): { splits: number; friends: number } {
  return { splits: idList(b.data["bs:history"]).length, friends: idList(b.data["bs:friends"]).length };
}
