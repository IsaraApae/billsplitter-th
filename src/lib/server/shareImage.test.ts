import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { cardNames, nameLine } = await import("./shareImage");

describe("nameLine (names on the share preview)", () => {
  it("lists everyone when they fit", () => expect(nameLine(["Boss", "Mint", "Ploy"])).toBe("Boss, Mint, Ploy"));
  it("ends with +N for the ones that don't fit", () =>
    expect(nameLine(["Alexander", "Benjamin", "Christopher", "Dan"])).toBe("Alexander, Benjamin +2"));
  it("puts the organiser last, so they're the first into +N", () => {
    const me = { name: "Isara", organiser: true };
    const ppl = (...names: string[]) => [me, ...names.map((name) => ({ name }))];
    expect(cardNames(ppl("Boss", "Mint"))).toBe("Boss, Mint, Isara");
    expect(cardNames(ppl("Boss", "Mint", "Ploy", "Pim"))).toBe("Boss, Mint, Ploy, Pim +1");
    expect(cardNames(ppl("Alexander", "Benjamin", "Christopher"))).toBe("Alexander, Benjamin +2");
  });
  it("always shows the first name, and skips blanks", () => {
    expect(nameLine(["Wongsakorn Srisawat", "Mint"])).toBe("Wongsakorn Srisawat +1");
    expect(nameLine(["Boss", " ", "Mint"])).toBe("Boss, Mint");
    expect(nameLine([])).toBe("");
  });
});
