import { describe, it, expect } from "vitest";
import { buildNav, canSeePage, pageByKey } from "./registry";
import type { Group, Permissions } from "@/lib/permissions";

const perms = (pages: Record<string, boolean>): Permissions => ({ pages, actions: {}, groups: {} });
const page = (key: string) => pageByKey(key)!;

describe("canSeePage — páginas públicas", () => {
  it("se ven por defecto si el rol no dice nada (rol nuevo / sin permisos)", () => {
    expect(canSeePage(perms({}), page("valor"))).toBe(true);
    expect(canSeePage(undefined, page("visor"))).toBe(true);
  });

  it("se ocultan si el rol las desmarca explícitamente", () => {
    expect(canSeePage(perms({ valor: false }), page("valor"))).toBe(false);
  });

  it("las no públicas siguen requiriendo estar marcadas", () => {
    expect(canSeePage(perms({}), page("roi"))).toBe(false);
    expect(canSeePage(perms({ roi: true }), page("roi"))).toBe(true);
  });
});

describe("buildNav", () => {
  const portafolios: Group = { id: "g1", name: "Portafolios", icon: "📁", pageKeys: ["iniciativas", "desarrollo-timelines"] };

  it("un rol con solo Players + ROI y las públicas desmarcadas ve solo esas dos", () => {
    const nav = buildNav(
      perms({ players: true, roi: true, valor: false, visor: false, "desarrollo-timelines": false }),
      [portafolios],
    );
    expect(nav.map((n) => (n.type === "item" ? n.item.label : n.label))).toEqual(["Players", "ROI"]);
  });

  it("una carpeta sin páginas visibles no aparece", () => {
    const nav = buildNav(perms({ "desarrollo-timelines": false }), [portafolios]);
    expect(nav.some((n) => n.type === "group")).toBe(false);
  });
});
