import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@vercel/blob", () => ({ del: async () => {}, list: async () => ({ blobs: [] }), put: async () => ({}) }));
vi.mock("./redis", () => ({ devImageDel: async () => {}, devImageGet: async () => null, devImagePut: async () => {} }));

process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_AbC123xyz_secretpart";
const { isOwnImageUrl, keepOwnPhoto, readQrImage } = await import("./qrStore");

const OWN = "https://abc123xyz.public.blob.vercel-storage.com/receipts/receipt-k2j3h4.jpg";
const OTHER = "https://evil999.public.blob.vercel-storage.com/receipts/x.html";

describe("isOwnImageUrl", () => {
  it("accepts this store's pictures only", () => {
    expect(isOwnImageUrl(OWN)).toBe(true);
    expect(isOwnImageUrl(OWN.replace("abc123xyz", "ABC123XYZ"))).toBe(true);
    expect(isOwnImageUrl(OTHER)).toBe(false);
    expect(isOwnImageUrl(OWN.replace("https:", "http:"))).toBe(false);
    expect(isOwnImageUrl("https://abc123xyz.public.blob.vercel-storage.com.evil.com/receipts/a.jpg")).toBe(false);
    expect(isOwnImageUrl("not a url")).toBe(false);
  });

  it("refuses dev: keys once Blob is configured", () => {
    expect(isOwnImageUrl("dev:r-0123456789abcdef")).toBe(false);
  });

  it("also knows a store named by BLOB_STORE_ID", () => {
    process.env.BLOB_STORE_ID = "store_Other42";
    try {
      expect(isOwnImageUrl("https://other42.public.blob.vercel-storage.com/slips/slip-a.jpg")).toBe(true);
    } finally {
      delete process.env.BLOB_STORE_ID;
    }
  });

  it("keepOwnPhoto drops a foreign photo and keeps ours", () => {
    expect(keepOwnPhoto({ photo: OTHER }).photo).toBeUndefined();
    expect(keepOwnPhoto({ photo: OWN }).photo).toBe(OWN);
  });
});

describe("readQrImage", () => {
  afterEach(() => vi.unstubAllGlobals());
  const serve = (body: string, type: string) => vi.stubGlobal("fetch", async () => new Response(body, { headers: { "Content-Type": type } }));

  it("never fetches another store's file", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect(await readQrImage(OTHER)).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("refuses anything that isn't a JPEG, PNG or WebP", async () => {
    for (const type of ["text/html", "image/svg+xml", "application/octet-stream"]) {
      serve("<script>alert(1)</script>", type);
      expect(await readQrImage(OWN)).toBeNull();
    }
  });

  it("serves our picture as an image that can't run as a page", async () => {
    serve("jpeg bytes", "image/jpeg");
    const res = await readQrImage(OWN);
    expect(res?.headers.get("content-type")).toBe("image/jpeg");
    expect(res?.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res?.headers.get("content-security-policy")).toContain("sandbox");
  });
});
