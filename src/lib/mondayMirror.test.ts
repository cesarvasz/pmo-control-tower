import { describe, expect, it } from "vitest";
import { aFilas, diferenciasItems, reconstruirItems, type BoardApi } from "@/lib/mondayMirror";
import type { MondayItem } from "@/types";

const STATUS = '{"labels":{"0":"Working on it","1":"Done"}}';

const boardProj: BoardApi = {
  id: "10",
  name: "PM-001 | Demo",
  columns: [
    { id: "status", title: "Status", settings_str: STATUS },
    { id: "date1", title: "End Date", settings_str: "{}" },
    { id: "rel", title: "Responsible", settings_str: "{}" },
  ],
  items: [
    {
      id: "100", name: "Fase 1", email: "a@x", group: { title: "1 | Valor" },
      column_values: [
        { id: "status", text: "Done" },
        { id: "date1", text: null },
        { id: "rel", text: null, display_value: "Ana" },
      ],
      subitems: [
        { id: "101", name: "Hito B", email: null, board: { id: "99" }, column_values: [{ id: "s_status", text: "Working on it" }] },
        { id: "102", name: "Hito A", email: null, board: { id: "99" }, column_values: [{ id: "s_status", text: "Done" }] },
      ],
    },
    { id: "200", name: "Fase 2", email: null, group: { title: "2 | Launch" }, column_values: [{ id: "status", text: "" }], subitems: [] },
  ],
};
const subBoards = [{ id: "99", name: "Subitems of PM-001", columns: [{ id: "s_status", title: "Status", settings_str: STATUS }] }];

/** Lo mismo que devolvería la consulta de la app (projBoardsQuery) para boardProj. */
const comoLaApi: MondayItem[] = [
  {
    id: "100", name: "Fase 1", email: "a@x", group: { title: "1 | Valor" },
    column_values: [
      { id: "status", text: "Done", column: { title: "Status", settings_str: STATUS } },
      { id: "date1", text: null, column: { title: "End Date", settings_str: "{}" } },
      { id: "rel", text: null, column: { title: "Responsible", settings_str: "{}" }, display_value: "Ana" },
    ],
    subitems: [
      { id: "101", name: "Hito B", email: null, board: { id: "99" }, column_values: [{ id: "s_status", text: "Working on it", column: { title: "Status", settings_str: STATUS } }] },
      { id: "102", name: "Hito A", email: null, board: { id: "99" }, column_values: [{ id: "s_status", text: "Done", column: { title: "Status", settings_str: STATUS } }] },
    ],
  },
  {
    id: "200", name: "Fase 2", email: null, group: { title: "2 | Launch" },
    column_values: [{ id: "status", text: "", column: { title: "Status", settings_str: STATUS } }],
    subitems: [],
  },
];

describe("aFilas", () => {
  it("guarda items y subitems con orden, padre y board oculto; columnas una vez por board", () => {
    const { board, items } = aFilas(boardProj, "proj", subBoards);
    expect(board.columnas.status).toEqual({ title: "Status", settings_str: STATUS });
    expect(board.sub_boards).toEqual([{ id: "99", nombre: "Subitems of PM-001", columnas: { s_status: { title: "Status", settings_str: STATUS } } }]);
    expect(items.map((i) => [i.id, i.parent_id, i.orden, i.sub_board_id])).toEqual([
      ["100", null, 0, null], ["101", "100", 0, "99"], ["102", "100", 1, "99"], ["200", null, 1, null],
    ]);
    // display_value solo donde la API lo trajo
    expect(items[0].column_values).toEqual([
      { id: "status", text: "Done" }, { id: "date1", text: null }, { id: "rel", text: null, display_value: "Ana" },
    ]);
    expect(items[1].grupo).toBeNull();
  });
});

describe("reconstruirItems", () => {
  it("vuelve a la forma de la API (ida y vuelta sin diferencias)", () => {
    const { board, items } = aFilas(boardProj, "proj", subBoards);
    const cols = { "99": board.sub_boards[0].columnas };
    // la base devuelve las filas en cualquier orden
    const vuelta = reconstruirItems([...items].reverse(), board.columnas, cols, true);
    expect(vuelta).toEqual(comoLaApi);
    expect(diferenciasItems("PM-001", comoLaApi, vuelta)).toEqual([]);
  });

  it("boards sin subitems (Iniciativas, RH…) no llevan la llave subitems", () => {
    const { board, items } = aFilas({ ...boardProj, items: boardProj.items.map((i) => ({ ...i, subitems: undefined })) }, "ini");
    const vuelta = reconstruirItems(items, board.columnas, {}, false);
    expect(vuelta.every((i) => !("subitems" in i))).toBe(true);
  });
});

describe("diferenciasItems", () => {
  const { board, items } = aFilas(boardProj, "proj", subBoards);
  const espejo = () => reconstruirItems(items, board.columnas, { "99": board.sub_boards[0].columnas }, true);

  it("detecta texto, faltantes, orden y subitems", () => {
    const e = espejo();
    e[0].column_values[0].text = "Working on it";
    e[0].subitems = e[0].subitems!.slice(0, 1);
    const difs = diferenciasItems("B", comoLaApi, [e[1], e[0]]);
    expect(difs).toContain("B/100: orden distinto");
    expect(difs).toContain('B/100.status.text: "Done" ≠ "Working on it"');
    expect(difs).toContain("B/100: 2 subitems vs 1");
    expect(difs).toContain("B/100/sub 102: falta en la copia");
  });

  it("solo compara los campos que pidió la consulta de la app", () => {
    // La consulta de RH no pide column ni email; la de Estrategia tampoco grupo. La copia los
    // trae de más y no es diferencia.
    const api = comoLaApi.map((i) => ({
      id: i.id, name: i.name, group: undefined as unknown as { title: string },
      column_values: i.column_values.map(({ id, text }) => ({ id, text })),
    }));
    expect(diferenciasItems("RH", api, espejo())).toEqual([]);
  });
});
