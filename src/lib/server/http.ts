import "server-only";
import { StorageNotConfiguredError } from "./redis";

export function jsonError(status: number, error: string, message: string, extra: object = {}) {
  return Response.json({ error, message, ...extra }, { status });
}

/** Wraps a route handler so unexpected failures become clean JSON errors. */
export async function safely(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof StorageNotConfiguredError) {
      return jsonError(503, "not_configured", "Sharing isn't set up yet: the Redis database is not connected.");
    }
    console.error(e);
    return jsonError(500, "server_error", "Something went wrong on our side. Please try again.");
  }
}

/** Reads a JSON body with a size cap. Returns undefined on bad/oversized input. */
export async function readJson(req: Request, maxBytes = 256_000): Promise<unknown | undefined> {
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > maxBytes) return undefined;
  const text = await req.text();
  if (text.length > maxBytes) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
