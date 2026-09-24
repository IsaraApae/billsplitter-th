// End-to-end smoke test against a deployment.
// Usage: node scripts/smoke-prod.mts https://your-app.vercel.app [receipt.jpg]
// Creates one small test split (expires in 90 days) and uploads + removes a test QR.
import { readFile } from "node:fs/promises";
import sharp from "sharp";

const base = (process.argv[2] ?? "").replace(/\/$/, "");
const receipt = process.argv[3];
if (!base) throw new Error("Pass the deployment URL");

const ok = (label: string, cond: boolean, extra: unknown = "") => console.log(`${cond ? "✓" : "✗"} ${label}`, extra);

const doc = {
  v: 1,
  title: "Smoke test",
  createdAt: new Date().toISOString(),
  currency: "THB",
  mode: "itemized",
  people: [
    { id: "me", name: "Me" },
    { id: "ann", name: "Ann" },
  ],
  items: [
    { id: "i1", name: "Pad Thai", qty: 1, price: 12000, assigned: ["me"] },
    { id: "i2", name: "ต้มยำกุ้ง", qty: 1, price: 30000, assigned: ["me", "ann"] },
  ],
  discount: { enabled: false, type: "percent", value: 0, scope: "all", itemIds: [] },
  service: { enabled: true, rateBp: 1000 },
  vat: { enabled: true, rateBp: 700 },
  payment: { promptpay: "0812345678", note: "", qrMode: "generate" },
  receipt: { subtotal: null, total: null },
};
const json = { "Content-Type": "application/json" };

// Splits
let r = await fetch(`${base}/api/splits`, { method: "POST", headers: json, body: JSON.stringify(doc) });
const created = await r.json();
ok("create split", r.status === 201, created.message ?? created.id);
const { id, token } = created;
r = await fetch(`${base}/api/splits/${id}`);
ok("read split", r.ok && (await r.json()).doc.title === "Smoke test");
r = await fetch(`${base}/api/splits/${id}/paid`, { method: "POST", headers: json, body: JSON.stringify({ personId: "ann", paid: true }) });
ok("tick without organiser token rejected", r.status === 403);
r = await fetch(`${base}/api/splits/${id}/paid`, { method: "POST", headers: { ...json, "x-edit-token": token }, body: JSON.stringify({ personId: "ann", paid: true }) });
ok("organiser can tick", r.ok && (await r.json()).paid.includes("ann"));
r = await fetch(`${base}/api/splits/${id}/paid`, { method: "POST", headers: json, body: JSON.stringify({ personId: "ann", paid: false }) });
ok("untick without organiser token rejected", r.status === 403);
r = await fetch(`${base}/api/splits/${id}/paid`, { method: "POST", headers: { ...json, "x-edit-token": token }, body: JSON.stringify({ personId: "ann", paid: false }) });
ok("organiser can untick", r.ok && !(await r.json()).paid.includes("ann"));
r = await fetch(`${base}/api/splits/${id}`, { method: "PUT", headers: { ...json, "x-edit-token": "x".repeat(43) }, body: JSON.stringify(doc) });
ok("wrong edit token rejected", r.status === 403);
r = await fetch(`${base}/api/splits/${id}`, { method: "PUT", headers: { ...json, "x-edit-token": token }, body: JSON.stringify({ ...doc, title: "Smoke test (edited)" }) });
ok("creator can edit", r.ok);
r = await fetch(`${base}/s/${id}`);
ok("shared page renders", r.ok && (await r.text()).includes("Smoke test (edited)"));
r = await fetch(`${base}/s/${id}/opengraph-image`);
ok("OG image", r.ok && r.headers.get("content-type") === "image/png");
console.log(`  → ${base}/s/${id}`);

// QR upload (Vercel Blob)
const png = await sharp({ create: { width: 300, height: 300, channels: 3, background: "#fff" } }).jpeg().toBuffer();
const fd = new FormData();
fd.append("image", new Blob([new Uint8Array(png)], { type: "image/jpeg" }), "qr.jpg");
r = await fetch(`${base}/api/qr`, { method: "POST", body: fd });
const qr = await r.json();
ok("upload QR to Blob", r.ok, qr.message ?? "");
if (r.ok) {
  r = await fetch(`${base}/api/qr/${qr.ownerId}?v=${qr.version}`);
  ok("serve QR image", r.ok && (r.headers.get("content-type") ?? "").startsWith("image/"));
  r = await fetch(`${base}/api/qr`, { method: "DELETE", headers: { "x-owner-id": qr.ownerId, "x-owner-token": qr.token } });
  ok("remove QR", r.ok);
}

// Scan (Gemini)
if (receipt) {
  const img = await sharp(await readFile(receipt)).rotate().resize(2048, 2048, { fit: "inside" }).jpeg({ quality: 85 }).toBuffer();
  const f = new FormData();
  f.append("image", new Blob([new Uint8Array(img)], { type: "image/jpeg" }), "receipt.jpg");
  const t0 = Date.now();
  r = await fetch(`${base}/api/scan`, { method: "POST", body: f });
  const s = await r.json();
  ok(`scan (${((Date.now() - t0) / 1000).toFixed(1)}s)`, r.ok, r.ok ? `engine=${s.engine} model=${s.model}` : s);
  if (r.ok) {
    const sum = s.items.reduce((a: number, i: { price: number }) => a + i.price, 0);
    for (const i of s.items) console.log(`    ${i.qty} × ${i.name} = ${i.price}`);
    console.log(`  items sum ${sum} | subtotal ${s.subtotal} | discount ${s.discount} | service ${s.service_charge ?? s.serviceCharge} | vat ${s.vat} | vatIncluded ${s.vatIncluded} | total ${s.total} | currency ${s.currency}`);
  }
}
