import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { nameLine } = await import("./shareImage");

describe("nameLine (names on the share preview)", () => {
  it("lists everyone when they fit", () => expect(nameLine(["Boss", "Mint", "Ploy"])).toBe("Boss, Mint, Ploy"));
  it("ends with +N for the ones that don't fit", () =>
    expect(nameLine(["Alexander", "Benjamin", "Christopher", "Dan"])).toBe("Alexander, Benjamin +2"));
  it("adds the organiser last, only when there's room", () => {
    expect(nameLine(["Boss", "Mint"], "Isara")).toBe("Boss, Mint, Isara");
    expect(nameLine(["Boss", "Mint", "Ploy", "Pim"], "Isara")).toBe("Boss, Mint, Ploy, Pim"); // no "+1" for the organiser
    expect(nameLine(["Alexander", "Benjamin", "Christopher"], "Isara")).toBe("Alexander, Benjamin +1");
    expect(nameLine([], "Isara")).toBe("Isara");
  });
  it("always shows the first name, and skips blanks", () => {
    expect(nameLine(["Wongsakorn Srisawat", "Mint"])).toBe("Wongsakorn Srisawat +1");
    expect(nameLine(["Boss", " ", "Mint"])).toBe("Boss, Mint");
    expect(nameLine([])).toBe("");
  });
});
