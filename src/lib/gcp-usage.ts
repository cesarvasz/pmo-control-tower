// src/lib/gcp-usage.ts
// SOLO SERVIDOR. Lecturas/escrituras/eliminaciones de Firestore consumidas HOY,
// vía la API de Cloud Monitoring — el mismo dato oficial que muestra la consola de
// Firebase (Firestore Database → Uso). Reutiliza la cuenta de servicio de
// FIREBASE_ADMIN_* (firebase-admin.ts); requiere que esa cuenta tenga el rol IAM
// "Monitoring Viewer" (roles/monitoring.viewer) en Google Cloud Console → IAM.

import { MetricServiceClient } from "@google-cloud/monitoring";

let cachedClient: MetricServiceClient | null = null;

function getProjectId(): string {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!projectId) throw new Error("Falta NEXT_PUBLIC_FIREBASE_PROJECT_ID en .env.local");
  return projectId;
}

function getClient(): MetricServiceClient {
  if (cachedClient) return cachedClient;
  const projectId = getProjectId();
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!clientEmail || !privateKey) {
    throw new Error("Firebase Admin sin configurar: define FIREBASE_ADMIN_CLIENT_EMAIL y FIREBASE_ADMIN_PRIVATE_KEY en .env.local");
  }
  cachedClient = new MetricServiceClient({ projectId, credentials: { client_email: clientEmail, private_key: privateKey } });
  return cachedClient;
}

// Límites diarios del plan Spark (gratis). En Blaze no aplica un tope duro, pero se
// muestran igual como referencia — la UI aclara que son del plan Spark.
export const FIRESTORE_SPARK_LIMITS = { reads: 50_000, writes: 20_000, deletes: 20_000 };

export interface FirestoreUsageToday {
  reads: number;
  writes: number;
  deletes: number;
  windowStart: string; // ISO — medianoche de hoy en hora del Pacífico (reset real de la cuota Spark)
  asOf: string;         // ISO — momento de la consulta
}

const METRIC_TYPE = {
  reads: "firestore.googleapis.com/document/read_count",
  writes: "firestore.googleapis.com/document/write_count",
  deletes: "firestore.googleapis.com/document/delete_count",
} as const;

/** Medianoche de HOY en hora del Pacífico (America/Los_Angeles): Firebase resetea
 *  la cuota diaria de Spark ahí, sin importar la zona horaria del usuario. */
function pacificMidnightToday(now: Date): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  const d = parts.find((p) => p.type === "day")!.value;
  // Offset actual (now vs. la misma hora expresada en Pacífico) para ubicar la
  // medianoche local del Pacífico en el instante UTC correcto.
  const pacificNow = new Date(now.toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));
  const offsetMs = now.getTime() - pacificNow.getTime();
  const localMidnight = new Date(`${y}-${m}-${d}T00:00:00`);
  return new Date(localMidnight.getTime() + offsetMs);
}

/** Suma el valor DELTA de una métrica de Firestore entre startTime y endTime
 *  (un solo período de alineación → un único punto sumado por serie). */
async function sumMetric(metricType: string, startTime: Date, endTime: Date): Promise<number> {
  const client = getClient();
  const projectId = getProjectId();
  const alignmentSeconds = Math.max(60, Math.floor((endTime.getTime() - startTime.getTime()) / 1000));

  const [timeSeries] = await client.listTimeSeries({
    name: client.projectPath(projectId),
    filter: `metric.type="${metricType}" AND resource.type="firestore_instance"`,
    interval: {
      startTime: { seconds: Math.floor(startTime.getTime() / 1000) },
      endTime: { seconds: Math.floor(endTime.getTime() / 1000) },
    },
    aggregation: {
      alignmentPeriod: { seconds: alignmentSeconds },
      perSeriesAligner: "ALIGN_SUM",
      crossSeriesReducer: "REDUCE_SUM",
    },
  });

  let total = 0;
  for (const series of timeSeries ?? []) {
    for (const point of series.points ?? []) {
      total += Number(point.value?.int64Value ?? point.value?.doubleValue ?? 0);
    }
  }
  return total;
}

/** Lecturas/escrituras/eliminaciones de Firestore desde la medianoche de hoy
 *  (hora del Pacífico) hasta ahora — mismo dato que la consola de Firebase. */
export async function getFirestoreUsageToday(): Promise<FirestoreUsageToday> {
  const now = new Date();
  const windowStart = pacificMidnightToday(now);
  const [reads, writes, deletes] = await Promise.all([
    sumMetric(METRIC_TYPE.reads, windowStart, now),
    sumMetric(METRIC_TYPE.writes, windowStart, now),
    sumMetric(METRIC_TYPE.deletes, windowStart, now),
  ]);
  return { reads, writes, deletes, windowStart: windowStart.toISOString(), asOf: now.toISOString() };
}
