"use client";

// «📅 Agendar» la Meeting 1 o la Meeting 2 de una iniciativa: crea el evento (con Meet y correos de Google) en el calendario del usuario.
// Es un panel dentro del pop-up, como «Completar». Pasos: conectar el Google del usuario (una vez) → elegir invitados del Directorio RH →
// día y horas (o un horario libre sugerido) → Agendar. El servidor decide el título (IN-### M1 · nombre), el tipo y el organizador.

import { useEffect, useMemo, useState } from "react";
import { authedFetch } from "@/lib/api";
import { Boton, Nota } from "../comun";

export interface PersonaAgenda { id: string; nombre: string; activo: boolean; email?: string | null }
interface Estado { configurado: boolean; conectado: boolean; estado: "activa" | "reconectar" | null; googleEmail: string | null }
interface Hueco { inicio: string; fin: string }
interface Creada { meetUrl: string | null; enlaceGoogle: string | null; inicio: string }
/** Una reunión ya agendada desde la app (para reprogramarla). */
export interface ReunionAgendada { id: string; inicio: string; fin: string; descripcion: string | null; invitados: { personaId: string | null }[] }

const etiquetaCampo = "text-[0.72rem] font-normal uppercase tracking-wide text-[var(--text-secondary)]";
const control = "rounded-lg border px-2 py-1 text-[0.8rem] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]";
const estiloControl = { borderColor: "var(--border)", background: "var(--bg-base)" };
const OFFSET = "-06:00"; // Guatemala, sin horario de verano
const DURACIONES = [30, 45, 60, 90, 120];

const hoyGT = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Guatemala" });
const sumarDias = (ymd: string, n: number) => new Date(Date.parse(`${ymd}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const diaDe = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Guatemala" });
const horaDe = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Guatemala" });
const fmtHueco = (h: Hueco) => `${new Date(h.inicio).toLocaleDateString("es-GT", { weekday: "short", day: "numeric", month: "short", timeZone: "America/Guatemala" })} · ${horaDe(h.inicio)}–${horaDe(h.fin)}`;
const aIso = (dia: string, hora: string) => new Date(`${dia}T${hora}:00${OFFSET}`).toISOString();

async function llamar<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await authedFetch(url, init);
  const j = (await r.json().catch(() => ({}))) as T & { error?: string };
  if (!r.ok) throw new Error(j.error ?? `Error ${r.status}`);
  return j;
}
const post = <T,>(url: string, body?: unknown) =>
  llamar<T>(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });

export default function AgendarReunion({ elementoId, accion, personas, reunion, onAgendada, onCancelar }: {
  elementoId: string;
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

  const caja = (children: React.ReactNode) => (
    <section className="flex flex-col gap-3 rounded-xl border p-3.5" style={{ borderColor: "var(--warn)", background: "var(--bg-base)" }} aria-label={`Agendar ${accion}`}>
      <div className="flex items-center gap-2">
        <h3 className="text-[0.95rem] font-bold text-[var(--text-primary)]">📅 {reunion ? "Reprogramar" : "Agendar"} {accion}</h3>
        <button type="button" onClick={onCancelar} className="ml-auto text-[0.78rem] font-semibold text-[var(--text-muted)] hover:underline">{creada ? "Cerrar" : "Cancelar"}</button>
      </div>
      {children}
    </section>
  );

  if (creada) {
    return caja(
      <>
        <Nota tono="ok">
          ¡Listo! La {accion} quedó {reunion ? "reprogramada para el" : "agendada el"} {new Date(creada.inicio).toLocaleDateString("es-GT", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Guatemala" })} a las {horaDe(creada.inicio)}.
          Google envió la invitación a las personas elegidas.
        </Nota>
        <div className="flex flex-wrap gap-3 text-[0.82rem] font-semibold">
          {creada.meetUrl && <a href={creada.meetUrl} target="_blank" rel="noreferrer" className="text-[var(--accent)] hover:underline">Abrir Meet</a>}
          {creada.enlaceGoogle && <a href={creada.enlaceGoogle} target="_blank" rel="noreferrer" className="text-[var(--accent)] hover:underline">Ver en Google Calendar</a>}
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
        <p className="text-[0.82rem] text-[var(--text-secondary)]">
          {estado.conectado
            ? "Tu conexión con Google venció. Vuelve a conectarla para agendar."
            : "Para agendar, la reunión se crea en TU calendario de Google. Conéctalo una sola vez; la app solo podrá crear y editar eventos y ver tu disponibilidad."}
        </p>
        <div><Boton primario onClick={() => void conectar()}>{estado.conectado ? "Reconectar mi Google" : "Conectar mi Google"}</Boton></div>
      </>,
    );
  }

  return caja(
    <>
      {error && <Nota tono="mal">{error}</Nota>}
      <p className="text-[0.75rem] text-[var(--text-muted)]">Se crea en el calendario de {estado.googleEmail ?? "tu cuenta"}, con enlace de Meet. Hora de Guatemala.</p>

      <div className="flex flex-col gap-1">
        <span className={etiquetaCampo}>Invitados (Directorio RH)</span>
        <div className="flex flex-wrap gap-1.5">
          {invitados.map((id) => (
            <span key={id} className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.78rem]" style={{ borderColor: "var(--border)" }}>
              {porId.get(id)?.nombre ?? id}
              <button type="button" aria-label={`Quitar a ${porId.get(id)?.nombre ?? id}`} onClick={() => setInvitados((l) => l.filter((x) => x !== id))} className="font-bold text-[var(--text-muted)]">×</button>
            </span>
          ))}
        </div>
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nombre o correo…" className={control} style={estiloControl} aria-label="Buscar invitado" />
        {sugeridas.length > 0 && (
          <ul className="flex flex-col rounded-lg border" style={{ borderColor: "var(--border)" }}>
            {sugeridas.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => { setInvitados((l) => [...l, p.id]); setBusca(""); setHuecos(null); }} className="flex w-full items-baseline gap-2 px-2 py-1 text-left text-[0.8rem] hover:bg-[var(--bg-hover)]">
                  <span className="font-semibold text-[var(--text-primary)]">{p.nombre}</span><span className="text-[var(--text-muted)]">{p.email}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-0.5"><span className={etiquetaCampo}>Día</span>
          <input type="date" value={dia} min={hoyGT()} onChange={(e) => setDia(e.target.value)} className={control} style={estiloControl} />
        </label>
        <label className="flex flex-col gap-0.5"><span className={etiquetaCampo}>Inicio</span>
          <input type="time" value={desde} onChange={(e) => setDesde(e.target.value)} className={control} style={estiloControl} />
        </label>
        <label className="flex flex-col gap-0.5"><span className={etiquetaCampo}>Fin</span>
          <input type="time" value={hasta} onChange={(e) => setHasta(e.target.value)} className={control} style={estiloControl} />
        </label>
        {desde && hasta && !horasOk && <span className="pb-1 text-[0.75rem] text-[var(--bad)]">El fin debe ser después del inicio.</span>}
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className={etiquetaCampo}>Horarios libres (lun–vie, 8:00–18:00)</span>
          <select value={duracion} onChange={(e) => { setDuracion(Number(e.target.value)); setHuecos(null); }} className={control} style={estiloControl} aria-label="Duración para sugerir">
            {DURACIONES.map((m) => <option key={m} value={m}>{m} min</option>)}
          </select>
          <Boton onClick={() => void verHuecos()} disabled={buscando}>{buscando ? "Buscando…" : "Ver horarios libres"}</Boton>
        </div>
        {avisoHuecos && <p className="text-[0.75rem] text-[var(--text-muted)]">{avisoHuecos}</p>}
        {huecos && !huecos.length && <p className="text-[0.8rem] text-[var(--text-muted)]">No hay horarios en común en los próximos 7 días.</p>}
        {huecos && huecos.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {huecos.slice(0, 12).map((h) => (
              <button
                key={h.inicio} type="button" onClick={() => { setDia(diaDe(h.inicio)); setDesde(horaDe(h.inicio)); setHasta(horaDe(h.fin)); }}
                className="rounded-full border px-2.5 py-0.5 text-[0.78rem] font-semibold hover:bg-[var(--bg-hover)]" style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
              >
                {fmtHueco(h)}
              </button>
            ))}
          </div>
        )}
      </div>

      <label className="flex flex-col gap-0.5"><span className={etiquetaCampo}>Descripción (opcional)</span>
        <textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} rows={2} maxLength={2000} className={control} style={estiloControl} />
      </label>

      <div className="flex justify-end gap-2">
        <Boton onClick={onCancelar} disabled={enviando}>Cancelar</Boton>
        <Boton primario onClick={() => void agendar()} disabled={!listo}>{enviando ? "Guardando…" : reunion ? "Guardar cambios" : `Agendar ${accion}`}</Boton>
      </div>
    </>,
  );
}
