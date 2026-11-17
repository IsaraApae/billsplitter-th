// Moments in Thailand time, for datetime-local fields and for showing them. Pure.

/** A moment as the value of a datetime-local field, in Thailand time ("2026-10-29T11:34"). */
export const toField = (ms: number) => new Date(ms + 7 * 3_600_000).toISOString().slice(0, 16);

/** Now, as a field value: the latest a field may go. */
export const nowField = () => toField(Date.now());

/** A datetime-local value (Thailand time) as a moment, or NaN. */
export const fromField = (v: string) => Date.parse(`${v}:00+07:00`);

/** "9 Nov 2026, 13:25" in Thailand time. */
export const when = (ms: number) =>
  new Date(ms).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });
