// Motor de FÓRMULAS de columna. Nunca usa eval: un tokenizador, un parser con precedencias y un
// evaluador sobre el árbol. Acepta la sintaxis de Monday (IF, DAYS, FORMAT_DATE, {col#End}…) para
// que las fórmulas importadas funcionen tal cual, más nombres en español (SI, DIAS, FIN…).
//
//   {Columna}            valor de otra columna del mismo nivel (en la base se guarda su id)
//   {Plan#Fin}/{Plan#End} fin de un rango (timeline); #Inicio/#Start, su inicio
//   + - * /  &  = <> < > <= >=  ( )  "texto"  123.5  TRUE FALSE
// Agregar una función = agregar una entrada a FUNCIONES. Lógica PURA.

export interface Rango { desde: string; hasta: string }
export type ValorF = number | string | boolean | null | Rango;
export type Parte = "inicio" | "fin" | null;

export type Nodo =
  | { t: "num"; v: number }
  | { t: "str"; v: string }
  | { t: "bool"; v: boolean }
  | { t: "ref"; ref: string; parte: Parte }
  | { t: "un"; op: "-" | "+"; a: Nodo }
  | { t: "bin"; op: string; a: Nodo; b: Nodo }
  | { t: "fn"; nombre: string; args: Nodo[] };

export class ErrorFormula extends Error {
  constructor(message: string) { super(message); this.name = "ErrorFormula"; }
}

// ── Tokenizador ──────────────────────────────────────────────────────────────

type Token =
  | { k: "num"; v: number } | { k: "str"; v: string } | { k: "ref"; v: string; parte: Parte }
  | { k: "id"; v: string } | { k: "op"; v: string };

const PARTES: Record<string, Parte> = { end: "fin", fin: "fin", start: "inicio", inicio: "inicio" };

function tokenizar(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9.]/.test(c) && /[0-9]/.test(src.slice(i, i + 2).replace(".", ""))) {
      const m = src.slice(i).match(/^\d*\.?\d+/)!;
      out.push({ k: "num", v: Number(m[0]) }); i += m[0].length; continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1; let s = "";
      while (j < src.length && src[j] !== c) { if (src[j] === "\\" && j + 1 < src.length) j++; s += src[j]; j++; }
      if (j >= src.length) throw new ErrorFormula("Falta cerrar unas comillas");
      out.push({ k: "str", v: s }); i = j + 1; continue;
    }
    if (c === "{") {
      const j = src.indexOf("}", i);
      if (j < 0) throw new ErrorFormula("Falta cerrar una llave }");
      const [ref, parte] = src.slice(i + 1, j).split("#");
      if (!ref.trim()) throw new ErrorFormula("Hay una referencia vacía {}");
      const p = parte ? PARTES[parte.trim().toLowerCase()] : null;
      if (parte && !p) throw new ErrorFormula(`No conozco «#${parte}» (usa #Inicio o #Fin)`);
      out.push({ k: "ref", v: ref.trim(), parte: p ?? null }); i = j + 1; continue;
    }
    const id = src.slice(i).match(/^[A-Za-z_ÁÉÍÓÚÑáéíóúñ][\wÁÉÍÓÚÑáéíóúñ.]*/);
    if (id) { out.push({ k: "id", v: id[0] }); i += id[0].length; continue; }
    const op = src.slice(i).match(/^(<=|>=|<>|!=|==|[-+*/&=<>(),;])/);
    if (op) { out.push({ k: "op", v: op[0] === ";" ? "," : op[0] }); i += op[0].length; continue; }
    throw new ErrorFormula(`Carácter inesperado «${c}»`);
  }
  return out;
}

// ── Parser (precedencia: comparación < & < + - < * / < unario) ───────────────

export function analizar(src: string): Nodo {
  const tk = tokenizar(src);
  if (!tk.length) throw new ErrorFormula("La fórmula está vacía");
  let i = 0;
  const ver = () => tk[i];
  const es = (v: string) => tk[i]?.k === "op" && tk[i].v === v;
  const tomar = (v: string) => { if (!es(v)) throw new ErrorFormula(`Se esperaba «${v}»`); i++; };

  const nivel = (ops: string[], siguiente: () => Nodo) => (): Nodo => {
    let a = siguiente();
    for (let t = ver(); t?.k === "op" && ops.includes(t.v); t = ver()) { i++; a = { t: "bin", op: t.v, a, b: siguiente() }; }
    return a;
  };
  const primario = (): Nodo => {
    const t = tk[i++];
    if (!t) throw new ErrorFormula("La fórmula termina de repente");
    if (t.k === "num") return { t: "num", v: t.v };
    if (t.k === "str") return { t: "str", v: t.v };
    if (t.k === "ref") return { t: "ref", ref: t.v, parte: t.parte };
    if (t.k === "op" && t.v === "(") { const n = comparacion(); tomar(")"); return n; }
    if (t.k === "op" && (t.v === "-" || t.v === "+")) return { t: "un", op: t.v, a: primario() };
    if (t.k === "id") {
      const nombre = t.v.toUpperCase();
      if (["TRUE", "VERDADERO"].includes(nombre) && !es("(")) return { t: "bool", v: true };
      if (["FALSE", "FALSO"].includes(nombre) && !es("(")) return { t: "bool", v: false };
      if (!FUNCIONES[nombre]) throw new ErrorFormula(`No conozco la función ${t.v}`);
      tomar("(");
      const args: Nodo[] = [];
      if (!es(")")) { args.push(comparacion()); while (es(",")) { i++; args.push(comparacion()); } }
      tomar(")");
      return { t: "fn", nombre, args };
    }
    throw new ErrorFormula(`No esperaba «${(t as { v: unknown }).v}»`);
  };
  const producto = nivel(["*", "/"], primario);
  const suma = nivel(["+", "-"], producto);
  const concat = nivel(["&"], suma);
  const comparacion = nivel(["=", "==", "<>", "!=", "<", ">", "<=", ">="], concat);

  const arbol = comparacion();
  if (i < tk.length) throw new ErrorFormula(`Sobra «${(tk[i] as { v: unknown }).v}» al final`);
  return arbol;
}

/** Referencias {…} de una fórmula (para validar y detectar ciclos). */
export function referencias(n: Nodo): string[] {
  switch (n.t) {
    case "ref": return [n.ref];
    case "un": return referencias(n.a);
    case "bin": return [...referencias(n.a), ...referencias(n.b)];
    case "fn": return n.args.flatMap(referencias);
    default: return [];
  }
}

// ── Conversión de valores ────────────────────────────────────────────────────

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
export const esRango = (v: ValorF): v is Rango => typeof v === "object" && v !== null && "desde" in v;
const esFecha = (v: ValorF): v is string => typeof v === "string" && FECHA_RE.test(v);

function num(v: ValorF): number {
  if (v === null || v === "") return 0; // como Monday: vacío cuenta como 0
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "string" && /^-?\d*\.?\d+$/.test(v.trim())) return Number(v);
  return NaN;
}

export function texto(v: ValorF): string {
  if (v === null) return "";
  if (esRango(v)) return `${v.desde} - ${v.hasta}`;
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(Math.round(v * 1e6) / 1e6);
  return String(v);
}

const verdad = (v: ValorF) => (typeof v === "boolean" ? v : typeof v === "number" ? v !== 0 : v !== null && v !== "");

function diaUTC(f: string): number { const [a, m, d] = f.split("-").map(Number); return Date.UTC(a, m - 1, d) / 86_400_000; }
function sumarDias(f: string, n: number): string { return new Date((diaUTC(f) + n) * 86_400_000).toISOString().slice(0, 10); }
function fechaDe(v: ValorF): string | null { return esFecha(v) ? v : esRango(v) ? v.hasta : null; }

function comparar(op: string, a: ValorF, b: ValorF): boolean {
  const na = num(a); const nb = num(b);
  const numericos = typeof a !== "string" && typeof b !== "string" ? true : Number.isFinite(na) && Number.isFinite(nb) && !esFecha(a) && !esFecha(b);
  const x: number | string = numericos ? na : texto(a);
  const y: number | string = numericos ? nb : texto(b);
  switch (op) {
    case "=": case "==": return x === y;
    case "<>": case "!=": return x !== y;
    case "<": return x < y;
    case ">": return x > y;
    case "<=": return x <= y;
    default: return x >= y;
  }
}

// ── Funciones ────────────────────────────────────────────────────────────────

type Ev = (n: Nodo) => ValorF;
interface Funcion { aridad: [number, number]; f(args: Nodo[], ev: Ev, hoy: string): ValorF }

const n1 = (f: (x: number) => number): Funcion => ({ aridad: [1, 1], f: ([a], ev) => f(num(ev(a))) });
const varios = (f: (xs: number[]) => number): Funcion => ({ aridad: [1, 99], f: (as, ev) => f(as.map((a) => num(ev(a)))) });
const alias = (f: Funcion, ...nombres: string[]) => Object.fromEntries(nombres.map((n) => [n, f]));

export const FUNCIONES: Record<string, Funcion> = {
  ...alias({ aridad: [2, 3], f: ([c, a, b], ev) => (verdad(ev(c)) ? ev(a) : b ? ev(b) : null) }, "IF", "SI"),
  ...alias({ aridad: [1, 99], f: (as, ev) => as.every((a) => verdad(ev(a))) }, "AND", "Y"),
  ...alias({ aridad: [1, 99], f: (as, ev) => as.some((a) => verdad(ev(a))) }, "OR", "O"),
  ...alias({ aridad: [1, 1], f: ([a], ev) => !verdad(ev(a)) }, "NOT", "NO"),
  // DAYS(a, b) = días de b a a (a − b), como en Monday.
  ...alias({ aridad: [2, 2], f: ([a, b], ev) => { const x = fechaDe(ev(a)); const y = fechaDe(ev(b)); return x && y ? diaUTC(x) - diaUTC(y) : null; } }, "DAYS", "DIAS", "DÍAS"),
  ...alias({ aridad: [0, 0], f: (_a, _e, hoy) => hoy }, "TODAY", "HOY"),
  // El formato de la fecha lo pone la columna; FORMAT_DATE solo devuelve la fecha.
  ...alias({ aridad: [1, 2], f: ([a], ev) => fechaDe(ev(a)) }, "FORMAT_DATE", "FECHA"),
  ...alias({ aridad: [2, 2], f: ([a, b], ev) => { const f = fechaDe(ev(a)); return f ? sumarDias(f, num(ev(b))) : null; } }, "ADD_DAYS", "SUMAR_DIAS"),
  ...alias({ aridad: [2, 2], f: ([a, b], ev) => { const f = fechaDe(ev(a)); return f ? sumarDias(f, -num(ev(b))) : null; } }, "SUBTRACT_DAYS", "RESTAR_DIAS"),
  ...alias({ aridad: [1, 1], f: ([a], ev) => { const v = ev(a); return esRango(v) ? v.desde : null; } }, "START", "INICIO"),
  ...alias({ aridad: [1, 1], f: ([a], ev) => { const v = ev(a); return esRango(v) ? v.hasta : fechaDe(v); } }, "END", "FIN"),
  ...alias({ aridad: [1, 2], f: ([a, b], ev) => { const p = 10 ** (b ? num(ev(b)) : 0); return Math.round(num(ev(a)) * p) / p; } }, "ROUND", "REDONDEAR"),
  ...alias({ aridad: [1, 2], f: ([a, b], ev) => { const p = 10 ** (b ? num(ev(b)) : 0); return Math.ceil(num(ev(a)) * p) / p; } }, "ROUNDUP", "REDONDEAR_ARRIBA"),
  ...alias({ aridad: [1, 2], f: ([a, b], ev) => { const p = 10 ** (b ? num(ev(b)) : 0); return Math.floor(num(ev(a)) * p) / p; } }, "ROUNDDOWN", "REDONDEAR_ABAJO"),
  ...alias(n1(Math.abs), "ABS"),
  ...alias(varios((xs) => Math.min(...xs)), "MIN"),
  ...alias(varios((xs) => Math.max(...xs)), "MAX"),
  ...alias(varios((xs) => xs.reduce((s, x) => s + x, 0)), "SUM", "SUMA"),
  ...alias(varios((xs) => xs.reduce((s, x) => s + x, 0) / xs.length), "AVERAGE", "PROMEDIO"),
  ...alias({ aridad: [2, 2], f: ([a, b], ev) => num(ev(a)) - num(ev(b)) }, "MINUS", "RESTA"),
  ...alias({ aridad: [2, 2], f: ([a, b], ev) => num(ev(a)) * num(ev(b)) }, "MULTIPLY", "MULTIPLICA"),
  ...alias({ aridad: [2, 2], f: ([a, b], ev) => { const d = num(ev(b)); return d === 0 ? null : num(ev(a)) / d; } }, "DIVIDE", "DIVIDE"),
  ...alias({ aridad: [1, 99], f: (as, ev) => as.map((a) => texto(ev(a))).join("") }, "CONCATENATE", "CONCATENAR"),
  ...alias({ aridad: [1, 1], f: ([a], ev) => texto(ev(a)).length }, "LEN", "LARGO"),
};

// ── Evaluación ───────────────────────────────────────────────────────────────

export type ValorDe = (ref: string) => ValorF;

/** Evalúa el árbol. Lanza ErrorFormula si algo no tiene sentido (función mal llamada…). */
export function evaluar(n: Nodo, valorDe: ValorDe, hoy: string): ValorF {
  const ev: Ev = (x) => {
    switch (x.t) {
      case "num": return x.v;
      case "str": return x.v;
      case "bool": return x.v;
      case "ref": {
        const v = valorDe(x.ref);
        if (!x.parte) return v;
        return esRango(v) ? (x.parte === "fin" ? v.hasta : v.desde) : null;
      }
      case "un": { const v = num(ev(x.a)); return x.op === "-" ? -v : v; }
      case "fn": {
        const f = FUNCIONES[x.nombre];
        if (x.args.length < f.aridad[0] || x.args.length > f.aridad[1]) throw new ErrorFormula(`${x.nombre} recibe ${f.aridad[0]}${f.aridad[1] !== f.aridad[0] ? `–${f.aridad[1]}` : ""} argumentos`);
        return f.f(x.args, ev, hoy);
      }
      case "bin": {
        if (x.op === "&") return texto(ev(x.a)) + texto(ev(x.b));
        const a = ev(x.a); const b = ev(x.b);
        if (["=", "==", "<>", "!=", "<", ">", "<=", ">="].includes(x.op)) return comparar(x.op, a, b);
        // fecha ± número = sumar días; fecha − fecha = días entre ellas
        if (x.op === "+" && esFecha(a) && typeof b === "number") return sumarDias(a, b);
        if (x.op === "-" && esFecha(a) && typeof b === "number") return sumarDias(a, -b);
        if (x.op === "-" && esFecha(a) && esFecha(b)) return diaUTC(a) - diaUTC(b);
        const na = num(a); const nb = num(b);
        if (x.op === "+") return na + nb;
        if (x.op === "-") return na - nb;
        if (x.op === "*") return na * nb;
        return nb === 0 ? null : na / nb;
      }
    }
  };
  const r = ev(n);
  return typeof r === "number" && !Number.isFinite(r) ? null : r;
}

/** Hoy en "AAAA-MM-DD" (hora local, como el resto de la app). */
export function hoyLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ── Referencias: ids (guardado) ↔ títulos (lo que ve el usuario) ─────────────

/** "{Effort Spent} * 9" → "{<id>} * 9". Error si un título no existe o se repite. */
export function titulosAIds(expr: string, columnas: { id: string; titulo: string }[]): string {
  return expr.replace(/\{([^}#]+)(#[^}]*)?\}/g, (_m, ref: string, parte = "") => {
    const r = ref.trim();
    if (r.toLowerCase() === "nombre" || r.toLowerCase() === "name") return `{nombre${parte}}`;
    if (columnas.some((c) => c.id === r)) return `{${r}${parte}}`;
    const hay = columnas.filter((c) => c.titulo.trim().toLowerCase() === r.toLowerCase());
    if (!hay.length) throw new ErrorFormula(`No hay una columna «${r}»`);
    if (hay.length > 1) throw new ErrorFormula(`Hay dos columnas «${r}»: cámbiale el título a una`);
    return `{${hay[0].id}${parte}}`;
  });
}

/** "{<id>} * 9" → "{Effort Spent} * 9" (las que ya no existen quedan como «?»). */
export function idsATitulos(expr: string, columnas: { id: string; titulo: string }[]): string {
  return expr.replace(/\{([^}#]+)(#[^}]*)?\}/g, (_m, ref: string, parte = "") => {
    if (ref === "nombre") return `{Nombre${parte}}`;
    return `{${columnas.find((c) => c.id === ref)?.titulo ?? "?"}${parte}}`;
  });
}
