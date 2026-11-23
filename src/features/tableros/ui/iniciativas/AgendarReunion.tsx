"use client";

// «📅 Agendar» la Meeting 1 o la Meeting 2 de una iniciativa: crea el evento (con Meet y correos de Google) en el calendario del usuario.
// Es un panel dentro del pop-up, como «Completar». Pasos: conectar el Google del usuario (una vez) → elegir invitados del Directorio RH →
// día y horas (o un horario libre sugerido) → Agendar. El servidor decide el título (IN-### M1 · nombre), el tipo y el organizador.

import { useEffect, useMemo, useState } from "react";
import { authedFetch } from "@/lib/api";
import { bloquesDelDia, chocaCon, VENTANA_DIA, type Intervalo } from "@/lib/disponibilidad";
import { Boton, Nota } from "../comun";
import { Avatar, controlPanel, estiloControlPanel, etiquetaPanel, foco, PanelAccion } from "./estilo";

export interface PersonaAgenda { id: string; nombre: string; activo: boolean; email?: string | null }
interface Estado { configurado: boolean; conectado: boolean; estado: "activa" | "reconectar" | null; googleEmail: string | null }
interface Hueco { inicio: string; fin: string }
interface Creada { meetUrl: string | null; enlaceGoogle: string | null; inicio: string }
/** Una reunión ya agendada desde la app (para reprogramarla). */
export interface ReunionAgendada { id: string; inicio: string; fin: string; descripcion: string | null; invitados: { personaId: string | null }[] }

const OFFSET = "-06:00"; // Guatemala, sin horario de verano
const DURACIONES = [30, 45, 60, 90, 120];

const hoyGT = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Guatemala" });
const sumarDias = (ymd: string, n: number) => new Date(Date.parse(`${ymd}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const diaDe = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Guatemala" });
const horaDe = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Guatemala" });
const fmtHueco = (h: Hueco) => `${new Date(h.inicio).toLocaleDateString("es-GT", { weekday: "short", day: "numeric", month: "short", timeZone: "America/Guatemala" })} · ${horaDe(h.inicio)}–${horaDe(h.fin)}`;
const aIso = (dia: string, hora: string) => new Date(`${dia}T${hora}:00${OFFSET}`).toISOString();
/** "HH:MM" → minutos desde la medianoche. */
const aMin = (hora: string) => { const [h, m] = hora.split(":").map(Number); return h * 60 + (m || 0); };
const fmtMin = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(Math.round(m % 60)).padStart(2, "0")}`;

/** Lo que se sabe de la agenda del día elegido. `porCalendario` usa como llave el correo (el tuyo = «primary»). */
interface AgendaDia { dia: string; cargando?: boolean; aviso?: string; porCalendario?: Record<string, Intervalo[]>; sinDatos?: string[] }

async function llamar<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await authedFetch(url, init);
  const j = (await r.json().catch(() => ({}))) as T & { error?: string };
  if (!r.ok) throw new Error(j.error ?? `Error ${r.status}`);
  return j;
}
const post = <T,>(url: string, body?: unknown) =>
  llamar<T>(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });

export default function AgendarReunion({ elementoId, accion, personas, reunion, onAgendada, onCancelar, plano }: {
  elementoId: string;
  /** Se muestra como pantalla completa del pop-up (no como tarjeta dentro de él). */
  plano?: boolean;
  /** Si viene, el panel REPROGRAMA esa reunión (mismo evento de Google) en vez de crear una nueva. */
  reunion?: ReunionAgendada;
  /** «Meeting 1» o «Meeting 2». */
  accion: string;
  personas: PersonaAgenda[];
  /** Ya se creó el evento: el pop-up recarga el tablero (la iniciativa pasa a «agendada»). */
  onAgendada(): void;
  onCancelar(): void;
}) {
  const [estado, setEstado] = useState<Estado | null>(null);
  const [errorEstado, setErrorEstado] = useState<string | null>(null);
  const [dia, setDia] = useState(() => (reunion ? diaDe(reunion.inicio) : sumarDias(hoyGT(), 1)));
  const [desde, setDesde] = useState(() => (reunion ? horaDe(reunion.inicio) : ""));
  const [hasta, setHasta] = useState(() => (reunion ? horaDe(reunion.fin) : ""));
  const [descripcion, setDescripcion] = useState(reunion?.descripcion ?? "");
  const [invitados, setInvitados] = useState<string[]>(() => (reunion ? reunion.invitados.map((i) => i.personaId).filter((x): x is string => !!x) : []));
  const [busca, setBusca] = useState("");
  const [duracion, setDuracion] = useState(60);
  const [huecos, setHuecos] = useState<Hueco[] | null>(null);
  const [avisoHuecos, setAvisoHuecos] = useState<string | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creada, setCreada] = useState<Creada | null>(null);

  useEffect(() => {
    let vivo = true;
    llamar<Estado>("/api/google/status").then((e) => { if (vivo) setEstado(e); }).catch((e) => { if (vivo) setErrorEstado(e instanceof Error ? e.message : "Error"); });
    return () => { vivo = false; };
  }, []);

  /** Personas que se pueden invitar: activas y con correo. */
  const candidatas = useMemo(() => personas.filter((p) => p.activo && p.email), [personas]);
  const porId = useMemo(() => new Map(candidatas.map((p) => [p.id, p])), [candidatas]);
  const sugeridas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return q ? candidatas.filter((p) => !invitados.includes(p.id) && (p.nombre.toLowerCase().includes(q) || (p.email ?? "").toLowerCase().includes(q))).slice(0, 6) : [];
  }, [busca, candidatas, invitados]);

  const horasOk = !!desde && !!hasta && hasta > desde;
  const listo = !!dia && horasOk && !enviando;

  // Agenda del día elegido, por persona: se vuelve a pedir al cambiar el día o los invitados.
  const conectado = !!estado?.conectado && estado.estado === "activa";
  const correosInvitados = useMemo(() => invitados.map((id) => porId.get(id)?.email?.trim().toLowerCase()).filter((x): x is string => !!x), [invitados, porId]);
  const [agenda, setAgenda] = useState<AgendaDia | null>(null);
  useEffect(() => {
    if (!conectado || !dia) return;
    const finDeSemana = [0, 6].includes(new Date(`${dia}T12:00:00Z`).getUTCDay());
    let vivo = true;
    const t = setTimeout(() => {
      if (finDeSemana) { setAgenda({ dia, aviso: "Es fin de semana: elige un día de lunes a viernes para ver la disponibilidad." }); return; }
      setAgenda((a) => (a?.dia === dia ? { ...a, cargando: true } : { dia, cargando: true }));
      post<{ porCalendario: Record<string, Intervalo[]>; sinDatos: string[] }>("/api/reuniones/disponibilidad", { desde: dia, hasta: dia, duracionMin: 30, invitados: correosInvitados })
        .then((r) => { if (vivo) setAgenda({ dia, porCalendario: r.porCalendario, sinDatos: r.sinDatos }); })
        .catch((e) => { if (vivo) setAgenda({ dia, aviso: e instanceof Error ? e.message : "No se pudo consultar la disponibilidad" }); });
    }, 350);
    return () => { vivo = false; clearTimeout(t); };
  }, [conectado, dia, correosInvitados]);

  async function conectar() {
    setError(null);
    try { window.location.assign((await post<{ url: string }>("/api/google/connect")).url); }
    catch (e) { setError(e instanceof Error ? e.message : "No se pudo iniciar la conexión"); }
  }

  async function verHuecos() {
    setBuscando(true); setError(null); setAvisoHuecos(null);
    try {
      const d0 = dia && dia >= hoyGT() ? dia : hoyGT();
      const r = await post<{ huecos: Hueco[]; sinDatos: string[]; aviso?: string }>("/api/reuniones/disponibilidad", {
        desde: d0, hasta: sumarDias(d0, 6), duracionMin: duracion, invitados: invitados.map((id) => porId.get(id)?.email).filter(Boolean),
      });
      setHuecos(r.huecos);
      const nombres = r.sinDatos.map((c) => candidatas.find((p) => p.email?.toLowerCase() === c)?.nombre ?? c);
      setAvisoHuecos([
        nombres.length ? `Sin información de disponibilidad de: ${nombres.join(", ")} (se puede agendar igual).` : "",
        r.aviso ?? "",
      ].filter(Boolean).join(" ") || null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo consultar la disponibilidad");
    } finally {
      setBuscando(false);
    }
  }

  async function agendar() {
    if (!listo) return;
    setEnviando(true); setError(null);
    try {
      const cuerpo = { inicio: aIso(dia, desde), fin: aIso(dia, hasta), descripcion: descripcion.trim() || null, invitados };
      type Respuesta = { reunion: { meetUrl: string | null; enlaceGoogle: string | null; inicio: string } };
      const r = reunion
        ? await llamar<Respuesta>(`/api/reuniones/${reunion.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) })
        : await post<Respuesta>("/api/reuniones", { elementoId, ...cuerpo });
      setCreada({ meetUrl: r.reunion.meetUrl, enlaceGoogle: r.reunion.enlaceGoogle, inicio: r.reunion.inicio });
      onAgendada();
    } catch (e) {
      setError(e instanceof Error ? e.message : reunion ? "No se pudo reprogramar" : "No se pudo agendar");
      if (reunion) onAgendada(); // el servidor pudo ponerse al día con Google (cambió allá o ya no existe): que se vea lo nuevo
    } finally {
      setEnviando(false);
    }
  }

  const titulo = `📅 ${reunion ? "Reprogramar" : "Agendar"} ${accion}`;
  const caja = (children: React.ReactNode, subtitulo?: React.ReactNode) => (
    <PanelAccion titulo={titulo} subtitulo={subtitulo} onCerrar={onCancelar} plano={plano} textoCerrar={creada ? "Cerrar" : "Cancelar"} etiqueta={`Agendar ${accion}`}>
      {children}
    </PanelAccion>
  );

  if (creada) {
    return caja(
      <>
        <Nota tono="ok">
          ¡Listo! La {accion} quedó {reunion ? "reprogramada para el" : "agendada el"} {new Date(creada.inicio).toLocaleDateString("es-GT", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Guatemala" })} a las {horaDe(creada.inicio)}.
          Google envió la invitación a las personas elegidas.
        </Nota>
        <div className="flex flex-wrap items-center gap-2">
          {creada.meetUrl && <a href={creada.meetUrl} target="_blank" rel="noreferrer" className={`rounded-md border px-2.5 py-1 text-[0.8rem] font-semibold text-[var(--accent)] hover:bg-[var(--bg-hover)] ${foco}`} style={{ borderColor: "var(--border)" }}>Abrir Meet ↗</a>}
          {creada.enlaceGoogle && <a href={creada.enlaceGoogle} target="_blank" rel="noreferrer" className={`rounded-md border px-2.5 py-1 text-[0.8rem] font-semibold text-[var(--accent)] hover:bg-[var(--bg-hover)] ${foco}`} style={{ borderColor: "var(--border)" }}>Ver en Google Calendar ↗</a>}
          <div className="ml-auto"><Boton primario onClick={onCancelar}>Cerrar</Boton></div>
        </div>
      </>,
    );
  }

  if (errorEstado) return caja(<Nota tono="mal">{errorEstado}</Nota>);
  if (!estado) return caja(<p className="text-[0.8rem] text-[var(--text-muted)]">Revisando tu conexión con Google…</p>);
  if (!estado.configurado) return caja(<Nota tono="mal">La conexión con Google todavía no está configurada en el servidor. Avísale a un administrador.</Nota>);

  if (!estado.conectado || estado.estado === "reconectar") {
    return caja(
      <>
        {error && <Nota tono="mal">{error}</Nota>}
        <div className="flex flex-wrap items-center gap-3 rounded-lg border px-3 py-3" style={{ borderColor: "var(--border-subtle)", background: "var(--bg-surface)" }}>
          <span aria-hidden className="text-[1.3rem]">🔗</span>
          <p className="min-w-0 flex-1 text-[0.82rem] text-[var(--text-secondary)]">
            {estado.conectado
              ? "Tu conexión con Google venció. Vuelve a conectarla para agendar."
              : "Para agendar, la reunión se crea en TU calendario de Google. Conéctalo una sola vez; la app solo podrá crear y editar eventos y ver tu disponibilidad."}
          </p>
          <Boton primario onClick={() => void conectar()}>{estado.conectado ? "Reconectar mi Google" : "Conectar mi Google"}</Boton>
        </div>
      </>,
    );
  }

  // Horarios libres agrupados por día (los mismos 12 primeros de siempre)
  const porDia = new Map<string, Hueco[]>();
  for (const h of (huecos ?? []).slice(0, 12)) porDia.set(diaDe(h.inicio), [...(porDia.get(diaDe(h.inicio)) ?? []), h]);
  const fmtDiaCorto = (ymd: string) => new Date(`${ymd}T12:00:00-06:00`).toLocaleDateString("es-GT", { weekday: "short", day: "numeric", month: "short", timeZone: "America/Guatemala" });

  return caja(
    <>
      {error && <Nota tono="mal">{error}</Nota>}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        {/* Izquierda: con quién, cuándo y de qué */}
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <span className={etiquetaPanel}>Invitados <span className="font-normal text-[var(--text-muted)]">· Directorio RH</span></span>
            {invitados.length > 0 && (
              <ul className="flex flex-wrap gap-1.5">
                {invitados.map((id) => {
                  const nombre = porId.get(id)?.nombre ?? id;
                  return (
                    <li key={id} className="inline-flex items-center gap-1.5 rounded-full border py-0.5 pl-0.5 pr-1.5 text-[0.78rem] text-[var(--text-primary)]" style={{ borderColor: "var(--border)", background: "var(--bg-surface)" }}>
                      <Avatar nombre={nombre} tamano={20} />
                      <span className="max-w-[10rem] truncate">{nombre}</span>
                      <button
                        type="button" aria-label={`Quitar a ${nombre}`} onClick={() => setInvitados((l) => l.filter((x) => x !== id))}
                        className={`grid h-4 w-4 place-items-center rounded-full text-[0.8rem] leading-none text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] ${foco}`}
                      >
                        ×
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="relative">
              <span aria-hidden className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[0.8rem] text-[var(--text-muted)]">⌕</span>
              <input
                value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Agregar por nombre o correo…" aria-label="Buscar invitado"
                className={`${controlPanel} w-full pl-6`} style={estiloControlPanel}
              />
              {sugeridas.length > 0 && (
                <ul className="absolute inset-x-0 top-[calc(100%+4px)] z-20 overflow-hidden rounded-lg border py-1 shadow-lg" style={{ borderColor: "var(--border)", background: "var(--bg-surface)" }}>
                  {sugeridas.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button" onClick={() => { setInvitados((l) => [...l, p.id]); setBusca(""); setHuecos(null); }}
                        className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[0.8rem] hover:bg-[var(--bg-hover)] ${foco}`}
                      >
                        <Avatar nombre={p.nombre} tamano={22} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium text-[var(--text-primary)]">{p.nombre}</span>
                          <span className="block truncate text-[0.72rem] text-[var(--text-muted)]">{p.email}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className={etiquetaPanel}>Fecha y hora <span className="font-normal text-[var(--text-muted)]">· Guatemala</span></span>
            <div className="flex flex-wrap items-center gap-2">
              <input type="date" value={dia} min={hoyGT()} onChange={(e) => setDia(e.target.value)} aria-label="Día" className={controlPanel} style={estiloControlPanel} />
              <input type="time" value={desde} onChange={(e) => setDesde(e.target.value)} aria-label="Inicio" className={controlPanel} style={estiloControlPanel} />
              <span aria-hidden className="text-[var(--text-muted)]">–</span>
              <input type="time" value={hasta} onChange={(e) => setHasta(e.target.value)} aria-label="Fin" className={controlPanel} style={estiloControlPanel} />
            </div>
            {desde && hasta && !horasOk && <span className="text-[0.75rem] text-[var(--bad)]">El fin debe ser después del inicio.</span>}
          </div>

          <label className="flex flex-col gap-1.5">
            <span className={etiquetaPanel}>Descripción <span className="font-normal text-[var(--text-muted)]">· opcional</span></span>
            <textarea
              value={descripcion} onChange={(e) => setDescripcion(e.target.value)} rows={3} maxLength={2000} placeholder="Agenda, objetivo, material…"
              className={`${controlPanel} h-auto resize-y py-1.5`} style={estiloControlPanel}
            />
          </label>
        </div>

        {/* Derecha: disponibilidad */}
        <div className="flex min-w-0 flex-col gap-4">
          <AgendaPorPersona
            agenda={agenda?.dia === dia ? agenda : null}
            personas={[{ clave: "primary", nombre: "Tú" }, ...invitados.map((id) => ({ clave: porId.get(id)?.email?.trim().toLowerCase() ?? id, nombre: porId.get(id)?.nombre ?? id }))]}
            elegido={horasOk ? [aMin(desde), aMin(hasta)] : null}
          />

          <div className="flex flex-col gap-2 border-t pt-3" style={{ borderColor: "var(--border-subtle)" }}>
            <div className="flex flex-wrap items-center gap-2">
              <span className={etiquetaPanel}>Horarios libres <span className="font-normal text-[var(--text-muted)]">· lun–vie, 8:00–18:00</span></span>
              <div className="ml-auto flex items-center gap-2">
                <div className="inline-flex rounded-md border p-0.5" style={{ borderColor: "var(--border)", background: "var(--bg-surface)" }} role="radiogroup" aria-label="Duración para sugerir">
                  {DURACIONES.map((m) => (
                    <button
                      key={m} type="button" role="radio" aria-checked={duracion === m} onClick={() => { setDuracion(m); setHuecos(null); }}
                      className={`rounded px-1.5 py-0.5 text-[0.72rem] font-semibold tabular-nums transition-colors ${foco}`}
                      style={duracion === m ? { background: "var(--accent)", color: "#fff" } : { color: "var(--text-secondary)" }}
                    >
                      {m}′
                    </button>
                  ))}
                </div>
                <Boton onClick={() => void verHuecos()} disabled={buscando}>{buscando ? "Buscando…" : "Ver horarios libres"}</Boton>
              </div>
            </div>
            {avisoHuecos && <p className="text-[0.74rem] text-[var(--text-muted)]">{avisoHuecos}</p>}
            {huecos && !huecos.length && <p className="text-[0.78rem] text-[var(--text-muted)]">No hay horarios en común en los próximos 7 días.</p>}
            {porDia.size > 0 && (
              <div className="flex flex-col gap-1.5">
                {[...porDia].map(([d, lista]) => (
                  <div key={d} className="flex items-baseline gap-2">
                    <span className="w-[5.5rem] shrink-0 text-[0.74rem] font-medium capitalize text-[var(--text-secondary)]">{fmtDiaCorto(d)}</span>
                    <div className="flex flex-wrap gap-1.5">
                      {lista.map((h) => {
                        const activo = dia === diaDe(h.inicio) && desde === horaDe(h.inicio) && hasta === horaDe(h.fin);
                        return (
                          <button
                            key={h.inicio} type="button" aria-label={fmtHueco(h)} aria-pressed={activo}
                            onClick={() => { setDia(diaDe(h.inicio)); setDesde(horaDe(h.inicio)); setHasta(horaDe(h.fin)); }}
                            className={`rounded-md border px-2 py-0.5 text-[0.76rem] font-semibold tabular-nums transition-colors hover:bg-[var(--bg-hover)] ${foco}`}
                            style={activo
                              ? { borderColor: "var(--accent)", background: "color-mix(in srgb, var(--accent) 14%, transparent)", color: "var(--text-primary)" }
                              : { borderColor: "var(--border)", background: "var(--bg-surface)", color: "var(--text-primary)" }}
                          >
                            {horaDe(h.inicio)}–{horaDe(h.fin)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-2 border-t pt-3" style={{ borderColor: "var(--border-subtle)" }}>
        <Boton onClick={onCancelar} disabled={enviando}>Cancelar</Boton>
        <Boton primario onClick={() => void agendar()} disabled={!listo}>{enviando ? "Guardando…" : reunion ? "Guardar cambios" : `Agendar ${accion}`}</Boton>
      </div>
    </>,
    <>Se crea en el calendario de {estado.googleEmail ?? "tu cuenta"}, con enlace de Meet.</>,
  );
}

const ESTADO_FILA = {
  libre: { texto: "Libre", color: "var(--ok)" },
  ocupado: { texto: "Ocupado", color: "var(--bad)" },
  sinDatos: { texto: "Sin datos", color: "var(--text-muted)" },
} as const;

/**
 * Una fila por persona (tú y cada invitado) con sus bloques ocupados del día elegido, de 7:00 a 19:00, y el horario elegido
 * marcado encima. Solo se ve libre/ocupado: Google no le da a la app los títulos ni los detalles de los eventos de otros.
 */
function AgendaPorPersona({ agenda, personas, elegido }: {
  agenda: AgendaDia | null;
  personas: { clave: string; nombre: string }[];
  /** Horario elegido en minutos [inicio, fin), o null si todavía no hay horas válidas. */
  elegido: [number, number] | null;
}) {
  const a = VENTANA_DIA.desde * 60, b = VENTANA_DIA.hasta * 60;
  const pct = (m: number) => `${((Math.min(b, Math.max(a, m)) - a) / (b - a)) * 100}%`;
  const ancho = (i: number, f: number) => `${((Math.min(b, f) - Math.max(a, i)) / (b - a)) * 100}%`;
  const horas = Array.from({ length: VENTANA_DIA.hasta - VENTANA_DIA.desde + 1 }, (_, k) => VENTANA_DIA.desde + k);
  const columnas = "grid grid-cols-[minmax(6rem,9rem)_1fr_4.75rem] items-center gap-2.5";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className={etiquetaPanel}>Disponibilidad del día</span>
        {(!agenda || agenda.cargando) && <span className="text-[0.72rem] text-[var(--text-muted)]">Consultando…</span>}
      </div>
      {agenda?.aviso && <p className="text-[0.75rem] text-[var(--text-muted)]">{agenda.aviso}</p>}
      {agenda?.porCalendario && (
        <div className="flex flex-col gap-1.5" role="table" aria-label="Disponibilidad por persona del día elegido">
          {/* Escala de horas */}
          <div className={columnas} aria-hidden>
            <span />
            <div className="relative h-3.5">
              {horas.filter((h) => h % 2 === 1).map((h) => (
                <span key={h} className="absolute -translate-x-1/2 text-[0.64rem] tabular-nums text-[var(--text-muted)]" style={{ left: pct(h * 60) }}>{h}</span>
              ))}
            </div>
            <span />
          </div>
          {personas.map((p) => {
            const ocupados = agenda.porCalendario?.[p.clave];
            const sinDatos = !ocupados;
            const bloques = ocupados ? bloquesDelDia(agenda.dia, ocupados) : [];
            const choca = !!elegido && !sinDatos && chocaCon(bloques, elegido[0], elegido[1]);
            const est = sinDatos ? ESTADO_FILA.sinDatos : !elegido ? null : choca ? ESTADO_FILA.ocupado : ESTADO_FILA.libre;
            return (
              <div key={p.clave} role="row" className={columnas}>
                <span role="cell" className="flex min-w-0 items-center gap-1.5" title={p.nombre}>
                  <Avatar nombre={p.nombre} tamano={20} />
                  <span className="truncate text-[0.78rem] font-medium text-[var(--text-primary)]">{p.nombre}</span>
                </span>
                <div
                  role="cell"
                  className="relative h-6 overflow-hidden rounded-md"
                  style={{
                    background: sinDatos
                      ? "repeating-linear-gradient(135deg, var(--bg-hover) 0 5px, transparent 5px 10px)"
                      : "color-mix(in srgb, var(--ok) 7%, var(--bg-surface))",
                    boxShadow: "inset 0 0 0 1px var(--border-subtle)",
                  }}
                  aria-label={sinDatos
                    ? `${p.nombre}: sin información de disponibilidad`
                    : bloques.length ? `${p.nombre}: ocupado ${bloques.map(([i, f]) => `${fmtMin(i)}–${fmtMin(f)}`).join(", ")}` : `${p.nombre}: libre todo el día`}
                >
                  {/* Líneas de cada hora */}
                  {horas.slice(1, -1).map((h) => (
                    <span key={h} aria-hidden className="absolute inset-y-0 w-px" style={{ left: pct(h * 60), background: "var(--border-subtle)" }} />
                  ))}
                  {bloques.map(([i, f]) => (
                    <span
                      key={i} title={`Ocupado ${fmtMin(i)}–${fmtMin(f)}`}
                      className="absolute inset-y-1 rounded-[3px]"
                      style={{ left: pct(i), width: ancho(i, f), background: "color-mix(in srgb, var(--text-muted) 55%, transparent)" }}
                    />
                  ))}
                  {elegido && (
                    <span
                      aria-hidden className="absolute inset-y-0 rounded-md border-2"
                      style={{ left: pct(elegido[0]), width: ancho(elegido[0], elegido[1]), borderColor: "var(--accent)", background: "color-mix(in srgb, var(--accent) 12%, transparent)" }}
                    />
                  )}
                </div>
                <span role="cell" className="flex justify-end">
                  {est && (
                    <span
                      className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[0.68rem] font-semibold"
                      style={{ background: `color-mix(in srgb, ${est.color} 13%, transparent)`, color: `color-mix(in srgb, ${est.color} 75%, var(--text-primary))` }}
                    >
                      <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: est.color }} />
                      {est.texto}
                    </span>
                  )}
                </span>
              </div>
            );
          })}
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.68rem] text-[var(--text-muted)]">
            <span className="inline-flex items-center gap-1"><span aria-hidden className="h-2.5 w-3.5 rounded-[3px]" style={{ background: "color-mix(in srgb, var(--text-muted) 55%, transparent)" }} />Ocupado</span>
            <span className="inline-flex items-center gap-1"><span aria-hidden className="h-2.5 w-3.5 rounded-[3px] border-2" style={{ borderColor: "var(--accent)" }} />Horario elegido</span>
            <span className="inline-flex items-center gap-1"><span aria-hidden className="h-2.5 w-3.5 rounded-[3px]" style={{ background: "repeating-linear-gradient(135deg, var(--text-muted) 0 2px, transparent 2px 4px)" }} />Sin información</span>
            <span>· Solo libre/ocupado, sin detalle de los eventos.</span>
          </div>
        </div>
      )}
    </div>
  );
}
