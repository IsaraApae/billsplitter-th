/**
 * Runs `fn` over `items` a few at a time, results in order, so a long list
 * doesn't flood the phone's connection or the server's rate limit.
 */
export async function inBatches<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  return out;
}
