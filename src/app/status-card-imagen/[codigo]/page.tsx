// Hoja de la Status Card SOLA, para que Chrome (sin ventana) le tome la foto que el bot de Google Chat manda al chat.
// Es el MISMO componente de /resumen-ejecutivo (StatusReport, una hoja A4 horizontal). Sin sesión: se entra solo con un
// código firmado de 2 minutos que emite el bot después de revisar permisos (features/google-chat/flujos/status-card).

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { verificarFirma } from "@/features/google-chat/nucleo/firma";
import { statusCardDeProyecto } from "@/features/google-chat/flujos/status-card/datos";
import { PREFIJO_CODIGO } from "@/features/google-chat/flujos/status-card/codigo";
import HojaStatusCard from "./HojaStatusCard";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Status Card", robots: { index: false, follow: false } };

export default async function Page({ params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  const dato = verificarFirma(decodeURIComponent(codigo));
  if (!dato?.startsWith(PREFIJO_CODIGO)) notFound();
  const data = await statusCardDeProyecto(dato.slice(PREFIJO_CODIGO.length));
  if (!data) notFound();
  return <HojaStatusCard data={data} />;
}
