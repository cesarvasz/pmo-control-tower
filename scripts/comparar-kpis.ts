// scripts/comparar-kpis.ts
// Fase 4 de la migración: los KPI deben dar IDÉNTICO con Firestore y con Supabase.
//
//   npx tsx scripts/comparar-kpis.ts
//
// Trae Monday / Calendar / Sheets, ROI y Clonación UNA sola vez y arma el dashboard dos veces, igual
// que /api/dashboard + el cron semanal: una con los datos de la app leídos de Firestore y otra con los
// de Supabase. Compara (1) los 5 KPI del portafolio (computeWeeklySnapshotMetrics, los mismos números
// que las tarjetas de Control Tower) y (2) el modelo completo del dashboard, de donde salen todas las
// páginas (PM, Players, Resumen Ejecutivo…). Solo lee: a diferencia de /api/dashboard, no guarda
// baselines. Se borra en la fase 6.

import * as viejo from "@/lib/firebase-admin";
import * as nuevo from "@/lib/store";
import { listNpsRecords } from "@/lib/surveys";
import { fetchDashboardRaw } from "@/lib/monday";
import { buildDashboardData } from "@/lib/dashboardData";
import { aplicarOnHold } from "@/lib/onHold";
import { computeWeeklySnapshotMetrics } from "@/lib/weeklySnapshot";
import { calcConfirmacionRoi } from "@/lib/dashboard";
import { fetchRoiRows } from "@/lib/roi";
import { fetchClonacionRows } from "@/lib/clonacion";
import type { NpsRecord } from "@/types";
import { canon, conComentario, diferencias, npsViejo } from "./legadoFirestore";

process.loadEnvFile(".env.local");

type Fuente = typeof nuevo & { listNpsRecords: () => Promise<NpsRecord[]> };

async function datosApp(f: Pick<Fuente, "getReqBaselines" | "getProjItemBaselines" | "getAttributions" | "getMetodologiaCalifs" | "getAtrasoDetalles" | "getBoardAlcances" | "getOnHold" | "getClases" | "listNpsRecords">) {
  const [baselines, projItemBaselines, npsRecords, delayAttributions, reprocesoAttributions, ckuDelayAttributions, ckuReprocesoAttributions, metodologiaCalifs, atrasoDetalles, boardAlcance, onHold, clases] = await Promise.all([
    f.getReqBaselines(), f.getProjItemBaselines(), f.listNpsRecords(),
    f.getAttributions("delay"), f.getAttributions("reproceso"), f.getAttributions("delay-cku"), f.getAttributions("reproceso-cku"),
    f.getMetodologiaCalifs(), f.getAtrasoDetalles(), f.getBoardAlcances(), f.getOnHold(), f.getClases(),
  ]);
  return { baselines, projItemBaselines, npsRecords, delayAttributions, reprocesoAttributions, ckuDelayAttributions, ckuReprocesoAttributions, metodologiaCalifs, atrasoDetalles, boardAlcance, onHold, clases };
}

const ms = (t0: number) => `${Math.round(performance.now() - t0)} ms`;

async function main() {
  let t0 = performance.now();
  const [raw, roi, clonacion] = await Promise.all([fetchDashboardRaw(), fetchRoiRows(), fetchClonacionRows()]);
  console.log(`Monday/Sheets/ROI: ${ms(t0)}`);
  const confirmacionRoi = calcConfirmacionRoi(roi.rows, clonacion.rows);

  t0 = performance.now();
  const deFirestore = await datosApp({
    ...viejo,
    listNpsRecords: npsViejo as () => Promise<NpsRecord[]>,
    getMetodologiaCalifs: async () => conComentario(await viejo.getMetodologiaCalifs()),
  });
  console.log(`Datos de la app desde Firestore: ${ms(t0)}`);
  t0 = performance.now();
  const deSupabase = await datosApp({ ...nuevo, listNpsRecords });
  console.log(`Datos de la app desde Supabase:  ${ms(t0)}\n`);

  const armar = (app: typeof deSupabase) => aplicarOnHold(buildDashboardData({ ...raw, ...app }));
  const dataF = armar(deFirestore);
  const dataS = armar(deSupabase);
  const kpiF = computeWeeklySnapshotMetrics(dataF, confirmacionRoi);
  const kpiS = computeWeeklySnapshotMetrics(dataS, confirmacionRoi);

  console.table(Object.keys(kpiF).map((k) => ({
    KPI: k,
    Firestore: (kpiF as unknown as Record<string, unknown>)[k],
    Supabase: (kpiS as unknown as Record<string, unknown>)[k],
    igual: (kpiF as unknown as Record<string, unknown>)[k] === (kpiS as unknown as Record<string, unknown>)[k] ? "✔" : "✖",
  })));

  const difsKpi = diferencias(canon(kpiF), canon(kpiS));
  const difsData = diferencias(canon(dataF), canon(dataS));
  console.log(`Modelo completo del dashboard: ${difsData.length ? `✖ ${difsData.length} diferencia(s)` : "✔ idéntico"}`);
  for (const d of difsData.slice(0, 15)) console.log(`    ${d.length > 300 ? `${d.slice(0, 300)}…` : d}`);
  if (difsData.length > 15) console.log(`    … y ${difsData.length - 15} más`);

  const ok = !difsKpi.length && !difsData.length;
  console.log(ok ? "\nKPI y dashboard idénticos con Firestore y con Supabase." : "\nHay diferencias.");
  process.exit(ok ? 0 : 1);
}

main().catch((err) => { console.error("✖", err instanceof Error ? err.message : err); process.exit(1); });
