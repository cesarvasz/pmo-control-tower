import { describe, expect, it } from "vitest";
import { puedeAgendarIniciativa, reunionQueToca } from "./reunion-iniciativa";

describe("reunionQueToca", () => {
  it("New → M1, Meeting 1 → M2, lo demás nada", () => {
    expect(reunionQueToca("New")).toBe("M1");
    expect(reunionQueToca(" meeting 1 ")).toBe("M2");
    expect(reunionQueToca(null)).toBe("M1");
    for (const s of ["Meeting 2", "Plan Futuro", "Sin Valor Def", 'PM "A"', "Cambio estrategia"]) expect(reunionQueToca(s)).toBeNull();
  });
});

describe("puedeAgendarIniciativa", () => {
  it("Admin siempre; PM solo si es el PM de la iniciativa", () => {
    expect(puedeAgendarIniciativa({ esAdmin: true, personaId: null }, [])).toBe(true);
    expect(puedeAgendarIniciativa({ esAdmin: false, personaId: "p1" }, ["p2", "p1"])).toBe(true);
    expect(puedeAgendarIniciativa({ esAdmin: false, personaId: "p1" }, ["p2"])).toBe(false);
    expect(puedeAgendarIniciativa({ esAdmin: false, personaId: null }, ["p1"])).toBe(false);
    expect(puedeAgendarIniciativa({ esAdmin: false, personaId: "p1" }, null)).toBe(false);
  });
});
