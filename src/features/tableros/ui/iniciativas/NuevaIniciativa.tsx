"use client";

// Pop-up de una iniciativa: para crearla («Nueva iniciativa») y para verla desde la lista. Dos pestañas:
//  · Datos: lo que llena el PM (nombre, PM, CKU, Estrategia y Proceso; todo obligatorio); el Sponsor se ve solo, de la Estrategia.
//  · Bitácora (opcional): solo comentarios y adjuntos; se pueden escribir desde antes de crearla y se publican al crearla.
// Status (New), grupo (Nuevas Iniciativas), Ini ID y fecha de creación los pone la app. Ya creada, arriba va el timeline:
// Creado (verde) → Meeting 1 (amarillo mientras sea el siguiente paso, con la fecha agendada o, si no, la fecha límite).
// Ya creada, en Datos aparece una sección aparte para llenar (opcional): Beneficio $, Presupuesto $, KPI y Tipo de iniciativa.
// Ya creada, todo lo de Datos se puede editar en su lugar (si hay permiso y no es dato de Monday). Pestañas: Datos ·
// Bitácora (solo comentarios y adjuntos) · Historial (cada cambio de un dato: quién, cuándo, antes → después).

import { useState } from "react";
import Modal from "@/components/Modal";
import { ESPERA_INTERVALO_DIAS, ESPERA_MAX_CORREOS, INI_LIMITS } from "@/lib/ini";
import { Boton, estiloControl, Nota, useCarga } from "../comun";
import { Celda, type EntornoCelda, type PersonaCorta } from "../celdas";
import { tipoColumna } from "../../dominio/tipos-columna";
import { etiquetaStatus, type ConfigStatus } from "../../dominio/tipos-columna/status";
import TimelineIniciativa from "./TimelineIniciativa";
import StatusIniciativa from "./StatusIniciativa";
import CompletarAccion, { fmtMomento } from "./CompletarAccion";
import AgendarReunion, { type ReunionAgendada } from "./AgendarReunion";
import { authedFetch } from "@/lib/api";
import { DIAS_CIERRE_ESPERA, esAccionCompletable, momentoDeAccion, type AccionCompletable, type CambioHistorial, type ClaseAprobada, type OpcionCompletar } from "../../dominio/acciones-iniciativa";
import { Campo } from "../tablero/FormularioAlta";
import Bitacora, { CajaComentario, publicarComentario } from "../tablero/Bitacora";
import { textoCelda, type Columna } from "../../dominio/tablero";
import { TextoEditable } from "../tablero/piezas";
import { Historial } from "../tablero/ElementoPanel";
import { camposDespues, camposQueLlena, columnasNuevaIni, estaAgendada, faltantes, pasosIniciativa, sinOpciones, tituloCampo } from "../../dominio/nueva-iniciativa";

// Tipografía: etiqueta chica en mayúsculas y ligera; valor debajo, más grande y en medium.
const etiqueta = "text-[0.72rem] font-normal uppercase leading-4 tracking-wide text-[var(--text-secondary)]";
/** Las celdas traen 0.82rem fijo y cortan el texto con «…»: aquí el valor va más grande y se parte en líneas. */
const celdaTexto = "[&_button]:text-[0.9rem] [&_button]:font-medium [&_button]:whitespace-normal [&_span]:text-[0.9rem] [&_span]:font-medium [&_span]:whitespace-normal [&_span]:text-left";
/** En la rejilla de arriba el valor va alineado con su etiqueta (sin el relleno de la celda). */
const celdaRejilla = "[&_button]:px-0 [&_span]:px-0";
const fmtCorta = (s: string) => new Date(`${s}T12:00:00`).toLocaleDateString("es-GT", { day: "numeric", month: "short", year: "numeric" });
const DIAS_M1 = INI_LIMITS.New;

type Pestana = "datos" | "bitacora" | "historial";

export default function NuevaIniciativa({
  tableroId, existenteId, columnas, personas, entorno, esAdmin, grupoId, valoresIniciales, editable, previsualizar, creada, onCrear, onCambiarValor, onRenombrar, onCompletar, onEliminar, onCerrar, onCambio,
}: {
  tableroId: string;
  /** Abrir una iniciativa que ya existe (desde la lista), en vez de crear una. */
  existenteId?: string;
  /** Todas las columnas del tablero. */
  columnas: Columna[];
  personas: (PersonaCorta & { email?: string | null })[];
  entorno: EntornoCelda;
  esAdmin: boolean;
  /** El grupo donde nace (Nuevas Iniciativas). */
  grupoId: string | null;
  /** Con qué nace (el status New). */
  valoresIniciales: Record<string, unknown>;
  /** ¿Puede llenar esta columna? */
  editable(c: Columna): boolean;
  /** El valor que tendría cada columna con lo que va llenando (para ver el Sponsor antes de crear). */
  previsualizar(valores: Record<string, unknown>): (c: Columna) => unknown;
  /** La iniciativa ya creada, con lo que calculó la app y qué se puede editar (null mientras no esté en los datos). */
  creada(id: string): {
    nombre: string; valorDe(c: Columna): unknown;
    /** ¿Puede editar esta columna? (permisos y, si vino de Monday, solo lo que no viene de Monday). */
    editable(c: Columna): boolean;
    nombreEditable: boolean;
    /** La iniciativa vino de Monday (sus datos de Monday se cambian allá). */
    deMonday: boolean;
    /** ¿Puede completar esta acción? (permiso sobre Status y la fecha Meet 1 / Meet 2, y que no vengan de Monday). */
    puedeCompletar(accion: AccionCompletable): boolean;
    /** ¿Puede agendar su reunión en Google Calendar? (tiene la acción y es el PM de la iniciativa, o es Admin). */
    puedeAgendar: boolean;
  } | null;
  /** Crea la iniciativa y recarga el tablero; devuelve su id. */
  onCrear(d: { nombre: string; grupoId: string; valores: Record<string, unknown> }): Promise<string>;
  /** Guarda un valor de la iniciativa ya creada; rechaza si no se guardó. */
  onCambiarValor(elementoId: string, c: Columna, valor: unknown): Promise<void>;
  /** Cambia el nombre de la iniciativa ya creada; rechaza si no se guardó. */
  onRenombrar(elementoId: string, nombre: string): Promise<void>;
  /** Completa la acción amarilla eligiendo la siguiente (o, en Sin Beneficio Definido, «Completar» o Aprobada); rechaza con el motivo si no se pudo. */
  onCompletar(elementoId: string, d: { accion: AccionCompletable; siguiente: OpcionCompletar; clase?: ClaseAprobada; fecha?: string }): Promise<void>;
  /** Elimina (archiva) la iniciativa; solo un Admin. Rechaza con el motivo si no se pudo. */
  onEliminar(elementoId: string): Promise<void>;
  onCerrar(): void;
  /** Algo cambió en la bitácora. */
  onCambio(): void;
}) {
  const k = columnasNuevaIni(columnas);
  const campos = camposQueLlena(k).filter(editable);
  const despues = camposDespues(k);
  const [pestana, setPestana] = useState<Pestana>("datos");
  const [nombre, setNombre] = useState("");
  const [valores, setValores] = useState<Record<string, unknown>>(valoresIniciales);
  const [texto, setTexto] = useState("");
  const [archivos, setArchivos] = useState<File[]>([]);
  const [falloNota, setFalloNota] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [id, setId] = useState<string | null>(existenteId ?? null);
  const [versionHistorial, setVersionHistorial] = useState(0);
  const [completando, setCompletando] = useState(false);
  const [agendando, setAgendando] = useState(false);
  const [reprogramando, setReprogramando] = useState(false);
  const [versionReunion, setVersionReunion] = useState(0);
  const [eliminando, setEliminando] = useState(false);
  // El historial da la fecha y hora exactas en que se completó la Meeting 1 y la Meeting 2 (lo anota la operación «iniciativa.completar»).
  const historia = useCarga<{ historial: CambioHistorial[] }>(existenteId || id ? `/api/tableros/tableros/${tableroId}/historial?elemento=${id ?? existenteId}&v=${versionHistorial}` : "");
  const recienCreada = !!id && !existenteId;

  const hecha = id ? creada(id) : null;
  const borrador = texto.trim() !== "" || archivos.length > 0;
  const sucio = !id && (nombre.trim() !== "" || borrador || Object.keys(valores).some((c) => JSON.stringify(valores[c]) !== JSON.stringify(valoresIniciales[c])));
  const cerrar = () => { if (!enviando && (!sucio || confirm("¿Descartar la iniciativa que estás llenando?"))) onCerrar(); };
  const cambiar = (c: Columna, v: unknown) => setValores((s) => {
    const n = { ...s };
    if (v === null || v === undefined) delete n[c.id]; else n[c.id] = v;
    return n;
  });
  const falta = faltantes(nombre, campos, valores);
  const vista = previsualizar(valores);
  const sponsor = k.sponsor ? vista(k.sponsor) : null;

  async function crear() {
    if (falta.length || !grupoId || enviando) return;
    setEnviando(true); setError(null); setAviso(null);
    try {
      const nuevo = await onCrear({ nombre: nombre.trim(), grupoId, valores });
      if (borrador) {
        try {
          const fallidos = await publicarComentario(`/api/tableros/tableros/${tableroId}`, nuevo, texto, archivos);
          if (fallidos.length) setAviso(`La bitácora se publicó, pero no se pudo subir: ${fallidos.join("; ")}`);
          onCambio();
        } catch (e) {
          setAviso(`La iniciativa se creó, pero la bitácora no se publicó (${e instanceof Error ? e.message : "error"}). Puedes escribirla de nuevo en la pestaña Bitácora.`);
        }
      }
      setTexto(""); setArchivos([]);
      setId(nuevo);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear");
    } finally {
      setEnviando(false);
    }
  }

  const nombreLigado = (eid: string) => Object.values(entorno.ligados).flatMap((l) => l.elementos).find((x) => x.id === eid)?.nombre;

  // ── Ya creada: editar guarda el cambio; el servidor lo anota en el historial (pestaña «Historial») ──
  async function guardar(c: Columna, v: unknown) {
    if (!id) return;
    setError(null); setAviso(null);
    try { await onCambiarValor(id, c, v); setVersionHistorial((n) => n + 1); } catch (e) { setError(e instanceof Error ? e.message : "No se pudo guardar"); }
  }
  async function renombrar(n: string) {
    if (!id) return;
    if (!n.trim()) { setError("El nombre no puede quedar vacío."); return; }
    setError(null); setAviso(null);
    try { await onRenombrar(id, n); setVersionHistorial((v) => v + 1); } catch (e) { setError(e instanceof Error ? e.message : "No se pudo guardar"); }
  }

  /** Un dato de la iniciativa ya creada, editable en su lugar (se guarda solo) o de solo lectura.
   *  `caja`: dentro de la tarjeta, como un input compacto; si no, en la rejilla de arriba (valor con subrayado punteado si se puede editar). */
  function campoCreada(c: Columna, campo: string, caja = false) {
    const puedeEditar = !!hecha?.editable(c);
    const deMonday = !!hecha?.deMonday && !puedeEditar && editable(c);
    return (
      <div key={c.id} className="flex min-w-0 flex-col gap-0.5">
        <span className={etiqueta}>{campo}{deMonday && <span title="Viene de Monday: se cambia en Monday" className="ml-1 normal-case">🔒</span>}</span>
        <div
          className={caja ? `${celdaTexto} rounded-md` : `${celdaTexto} ${celdaRejilla}`}
          style={caja
            ? (puedeEditar ? { border: "1px solid var(--border-subtle)", background: "var(--bg-base)" } : undefined)
            : (puedeEditar ? { borderBottom: "1px dashed var(--border)" } : undefined)}
        >
          <Celda
            columna={c} valor={hecha?.valorDe(c) ?? null} editable={puedeEditar} personas={personas} elementoId={id ?? undefined} entorno={entorno}
            onCambiar={(v) => void guardar(c, v)}
          />
        </div>
      </div>
    );
  }

  /** Un dato de la rejilla de arriba (PM, CKU, Estrategia, Proceso): al crear, el campo a llenar; ya creada, el valor editable. */
  function datoSuperior(c: Columna | undefined) {
    if (!c) return null;
    if (id) return campoCreada(c, tituloCampo(c));
    if (!campos.some((x) => x.id === c.id)) return null;
    return (
      <div key={c.id} className="flex min-w-0 flex-col gap-0.5">
        <span className={etiqueta}>{tituloCampo(c)} {!sinOpciones(c) && <span className="text-[var(--bad)]">*</span>}</span>
        <div className={celdaTexto}>
          <Campo columna={c} valor={valores[c.id] ?? null} personas={personas} entorno={entorno} onCambiar={(v) => cambiar(c, v)} />
        </div>
        {sinOpciones(c) && <span className="text-[0.68rem] leading-tight text-[var(--text-muted)]">Todavía no tiene opciones: será obligatorio en cuanto las tenga.</span>}
      </div>
    );
  }

  const leer =(c: Columna | undefined) => (c && hecha ? hecha.valorDe(c) : null);
  const iniId = k.iniId ? textoCelda(k.iniId, leer(k.iniId)) : "";
  const limite = leer(k.fechaLimite);
  const reunion = leer(k.reunion);
  const agendada = estaAgendada(reunion);
  const configStatus = k.status ? (tipoColumna("status")!.config.validar(k.status.config) as ConfigStatus) : null;
  const vStatus = leer(k.status);
  const status = configStatus && typeof vStatus === "string" ? etiquetaStatus(configStatus, vStatus) : undefined;
  const momentoM1 = momentoDeAccion(historia.data?.historial ?? [], "Meeting 1");
  const momentoM2 = momentoDeAccion(historia.data?.historial ?? [], "Meeting 2");
  const momentoPF = momentoDeAccion(historia.data?.historial ?? [], "Plan Futuro");
  const momentoSB = momentoDeAccion(historia.data?.historial ?? [], "Sin Beneficio Definido");
  const pasos = pasosIniciativa({
    status: status?.texto ?? null, creacion: leer(k.creacion), meet1: leer(k.meet1), meet1Momento: momentoM1 ? fmtMomento(new Date(momentoM1)) : null,
    meet2Momento: momentoM2 ? fmtMomento(new Date(momentoM2)) : null, planFuturoMomento: momentoPF ? fmtMomento(new Date(momentoPF)) : null,
    sinBeneficioMomento: momentoSB ? fmtMomento(new Date(momentoSB)) : null, esperaCierre: leer(k.esperaCierre), meet2: leer(k.meet2), planFuturo: leer(k.planFuturo), espera: leer(k.espera), proximaAccion: leer(k.proximaAccion),
    hoy: new Date().toLocaleDateString("en-CA", { timeZone: "America/Guatemala" }), fechaLimite: limite, reunion, fmt: fmtCorta,
  });
  const siguiente = pasos.find((p) => p.estado === "siguiente");
  const esReunion = siguiente?.clave === "meeting1" || siguiente?.clave === "meeting2";

  // La reunión que agendó la app para esta etapa: de ahí salen «Reprogramar» y «Cancelar reunión» (solo si está en MI calendario)
  const tipoReunion = siguiente?.clave === "meeting1" ? "M1" : "M2";
  const reunionesApp = useCarga<{ reuniones: (ReunionAgendada & { tipo: string; esMia: boolean })[] }>(
    id && esReunion && agendada === true && hecha?.puedeAgendar ? `/api/reuniones?elementoId=${id}&v=${versionReunion}` : "",
  );
  const reunionMia = reunionesApp.data?.reuniones.find((r) => r.tipo === tipoReunion && r.esMia) ?? null;
  async function cancelarReunion() {
    if (!reunionMia || !confirm(`¿Cancelar la ${siguiente?.accion}? Se borra el evento de tu Google Calendar y se avisa a los invitados.`)) return;
    setError(null);
    try {
      const r = await authedFetch(`/api/reuniones/${reunionMia.id}`, { method: "DELETE" });
      if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? `Error ${r.status}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cancelar la reunión");
    }
    setVersionReunion((n) => n + 1);
    onCambio(); // la iniciativa vuelve a «Sin agendar» (o se pone al día si algo cambió en Google)
  }

  /** La acción amarilla, si se completa con el botón (Meeting 1 o Meeting 2). */
  const porCompletar = siguiente?.completable && esAccionCompletable(siguiente.accion) ? siguiente.accion : null;

  async function eliminar() {
    if (!id || !esAdmin || eliminando) return;
    if (!confirm(`¿Eliminar la iniciativa ${iniId ? `${iniId} ` : ""}«${hecha?.nombre ?? nombre}»?\n\nDejará de verse en toda la app. Su bitácora y su historial se conservan.`)) return;
    setEliminando(true); setError(null);
    try {
      await onEliminar(id);
      onCerrar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo eliminar");
      setEliminando(false);
    }
  }

  async function completar(accion: AccionCompletable, d: { siguiente: OpcionCompletar; clase?: ClaseAprobada; fecha?: string }) {
    if (!id) return;
    await onCompletar(id, { accion, ...d });
    setCompletando(false);
    setVersionHistorial((n) => n + 1);
    setPestana("datos");
  }

  return (
    <Modal open onClose={id ? onCerrar : cerrar} width={1040} label={id ? `Iniciativa ${iniId}` : "Nueva iniciativa"}>
      <div className="flex min-h-0 flex-1 flex-col">
        {/* Arriba (fijo): título, avisos, timeline y pestañas */}
        <div className="flex shrink-0 flex-col gap-3 px-5 pt-4">
          <div className="flex flex-wrap items-center gap-2">
            {id && iniId && (
              <span className="rounded px-1.5 py-0.5 text-[0.78rem] font-bold tabular-nums text-[var(--text-secondary)]" style={{ background: "var(--code-bg)" }}>{iniId}</span>
            )}
            <h2 className="min-w-0 flex-1 truncate text-base font-semibold text-[var(--text-primary)]">{id ? hecha?.nombre ?? nombre : "Nueva iniciativa"}</h2>
            {id && <StatusIniciativa salud={leer(k.salud)} etapa={status} />}
          </div>

          {error && <Nota tono="mal">{error}</Nota>}
          {recienCreada && <Nota tono="ok">Iniciativa creada en «Nuevas Iniciativas» con status New.</Nota>}
          {aviso && <Nota tono="mal">{aviso}</Nota>}

          {/* Timeline: lo hecho en verde, la siguiente acción en amarillo (con su fecha debajo) */}
          {id && (hecha ? (
            <section className="flex flex-col gap-1.5" aria-label="Timeline">
              <TimelineIniciativa
                pasos={pasos} onCompletar={porCompletar && hecha.puedeCompletar(porCompletar) && !completando ? () => setCompletando(true) : undefined}
                onAgendar={esReunion && hecha.puedeAgendar && agendada !== true && !agendando && !completando ? () => setAgendando(true) : undefined}
                onReprogramar={reunionMia && !reprogramando && !completando ? () => setReprogramando(true) : undefined}
                onCancelarReunion={reunionMia && !reprogramando && !completando ? () => void cancelarReunion() : undefined}
              />
              {reprogramando && reunionMia && id && (
                <AgendarReunion
                  key={reunionMia.id} elementoId={id} accion={siguiente?.accion ?? ""} personas={personas} reunion={reunionMia}
                  onAgendada={() => { setVersionReunion((n) => n + 1); onCambio(); }} onCancelar={() => setReprogramando(false)}
                />
              )}
              {agendando && esReunion && id && (
                <AgendarReunion
                  key={siguiente.clave} elementoId={id} accion={siguiente.accion} personas={personas}
                  onAgendada={onCambio} onCancelar={() => setAgendando(false)}
                />
              )}
              {completando && porCompletar && (
                <CompletarAccion key={porCompletar} accion={porCompletar} onConfirmar={(d) => completar(porCompletar, d)} onCancelar={() => setCompletando(false)} />
              )}
              {porCompletar && !hecha.puedeCompletar(porCompletar) && (
                <p className="text-[0.75rem] text-[var(--text-muted)]">
                  {hecha.deMonday ? `Viene de Monday: «${porCompletar}» se completa en Monday hasta el corte.` : "No tienes permiso para completar esta acción."}
                </p>
              )}
              {siguiente?.clave === "sin-beneficio" && (
                <p className="text-[0.75rem] text-[var(--text-muted)]">
                  Usa los recordatorios de «Sin Valor Def»: un correo al CKU cada {ESPERA_INTERVALO_DIAS} días hábiles, máximo {ESPERA_MAX_CORREOS}, desde «En Espera». Marcar PKU los pausa.
                  Si pasan {DIAS_CIERRE_ESPERA} días hábiles después del último y no se aprueba, se cierra sola: queda en verde con el mismo status.
                </p>
              )}
              {esReunion && agendada === false && (
                <p className="text-[0.75rem] text-[var(--text-muted)]">
                  La {siguiente.accion} cuenta como agendada cuando el evento del calendario lleva el Ini ID{iniId ? ` (${iniId})` : ""}.
                </p>
              )}
              {esReunion && agendada === null && (
                <p className="text-[0.75rem] text-[var(--text-muted)]">No se pudo leer el calendario: se muestra la fecha límite.</p>
              )}
            </section>
          ) : <p className="text-[0.8rem] text-[var(--text-muted)]">Calculando…</p>)}

          {/* Pestañas */}
          <div className="flex gap-1 border-b" style={{ borderColor: "var(--border)" }} role="tablist" aria-label="Secciones de la iniciativa">
            {([["datos", "Datos"], ["bitacora", !id && borrador ? "Bitácora •" : "Bitácora"], ...(id ? [["historial", "Historial"] as const] : [])] as const).map(([clave, texto]) => (
              <button
                key={clave} type="button" role="tab" aria-selected={pestana === clave} onClick={() => setPestana(clave)}
                className="-mb-px border-b-2 px-3 py-1.5 text-[0.82rem] font-bold"
                style={pestana === clave ? { borderColor: "var(--accent)", color: "var(--text-primary)" } : { borderColor: "transparent", color: "var(--text-muted)" }}
              >
                {texto}
              </button>
            ))}
          </div>
        </div>

        {/* Centro: lo único que hace scroll (si la pantalla es muy baja) */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3" role="tabpanel">
          {pestana === "datos" && (
            <div className="flex flex-col gap-3.5">
              {/* Rejilla de 3 columnas: Nombre · PM · CKU / Sponsor · Estrategia · Proceso */}
              <div className="grid grid-cols-1 gap-x-5 gap-y-3 sm:grid-cols-3">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className={etiqueta}>Nombre de la iniciativa {!id && <span className="text-[var(--bad)]">*</span>}</span>
                  {id ? (
                    <TextoEditable
                      valor={hecha?.nombre ?? nombre} editable={!!hecha?.nombreEditable} max={255} onGuardar={(n) => void renombrar(n)}
                      className="min-h-[30px] w-full py-1 text-[0.95rem] font-bold leading-snug text-[var(--text-primary)]"
                      style={hecha?.nombreEditable ? { borderBottom: "1px dashed var(--border)", borderRadius: 0 } : undefined}
                    />
                  ) : (
                    <input
                      autoFocus value={nombre} maxLength={255} onChange={(e) => setNombre(e.target.value)} placeholder="¿Qué se quiere lograr?"
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void crear(); } }}
                      className="min-h-[30px] w-full rounded-md border px-2 py-1 text-[0.95rem] font-bold text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                      style={estiloControl.style}
                    />
                  )}
                </div>
                {datoSuperior(k.pm)}
                {datoSuperior(k.cku)}

                {k.sponsor && (
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className={etiqueta}>Sponsor</span>
                    <div className={`${celdaTexto} ${celdaRejilla} flex min-h-[30px] items-center`}>
                      {id ? (
                        <Celda columna={k.sponsor} valor={hecha?.valorDe(k.sponsor) ?? null} editable={false} personas={personas} elementoId={id} entorno={entorno} onCambiar={() => {}} />
                      ) : sponsor ? <span className="text-[0.9rem] font-medium text-[var(--text-primary)]">{String(sponsor)}</span> : <span className="text-[var(--text-muted)]">—</span>}
                    </div>
                  </div>
                )}
                {datoSuperior(k.estrategia)}
                {datoSuperior(k.proceso)}
              </div>

              {/* Ya creada: lo que se llena después (opcional), en una tarjeta aparte de ancho completo */}
              {id && despues.length > 0 && (
                <section className="w-full rounded-xl border p-3.5" style={{ borderColor: "var(--border)" }} aria-label="Beneficio, presupuesto y KPI">
                  <h3 className="text-base font-bold leading-tight text-[var(--text-primary)]">Beneficio, presupuesto y KPI</h3>
                  <p className="mt-0.5 text-xs text-[var(--text-muted)]">Se llena ya creada la iniciativa; se guarda al salir de cada campo.</p>
                  <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5">
                    {despues.map(({ columna: c, etiqueta: et }) => campoCreada(c, et, true))}
                  </div>
                </section>
              )}
              {!id && (
                <p className="rounded-lg border px-3 py-2 text-[0.75rem] text-[var(--text-muted)]" style={{ borderColor: "var(--border-subtle)" }}>
                  Todo lo de esta pestaña es obligatorio; la bitácora es opcional. Al crearla: status <strong>New</strong>, grupo <strong>Nuevas Iniciativas</strong>, Ini ID y fecha de creación automáticos.
                  Desde ese momento corren {DIAS_M1} días hábiles para la Meeting 1.
                </p>
              )}
            </div>
          )}

          {pestana === "bitacora" && (
            id ? (
              <Bitacora tableroId={tableroId} elementoId={id} puedeComentar esAdmin={esAdmin} onCambio={onCambio} />
            ) : (
              <div className="flex flex-col gap-2">
                <p className="text-[0.75rem] text-[var(--text-muted)]">Lo que escribas y adjuntes aquí se publica en la bitácora al crear la iniciativa.</p>
                <CajaComentario
                  texto={texto} archivos={archivos} placeholder="Contexto, acuerdos, documentos…" enviando={enviando} fallo={falloNota}
                  onTexto={setTexto} onArchivos={setArchivos} onFallo={setFalloNota}
                />
              </div>
            )
          )}

          {pestana === "historial" && id && (
            <Historial key={versionHistorial} tableroId={tableroId} elementoId={id} columnas={columnas} personas={personas} nombreElemento={nombreLigado} sinTope />
          )}
        </div>

        {/* Abajo (fijo): acciones */}
        <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t px-5 py-3" style={{ borderColor: "var(--border-subtle)" }}>
          {id ? (
            <>
              {esAdmin && (
                <Boton
                  type="button" onClick={() => void eliminar()} disabled={eliminando || !hecha || hecha.deMonday} className="mr-auto"
                  title={hecha?.deMonday ? "Viene de Monday: se elimina en Monday hasta el corte" : "Eliminar la iniciativa (solo Admin)"}
                >
                  {eliminando ? "Eliminando…" : "🗑 Eliminar iniciativa"}
                </Boton>
              )}
              <Boton primario onClick={onCerrar} disabled={eliminando}>Cerrar</Boton>
            </>
          ) : (
            <>
              {falta.length > 0 && <span className="mr-auto self-center text-[0.75rem] text-[var(--text-muted)]">Falta: {falta.join(", ")}</span>}
              <Boton type="button" onClick={cerrar} disabled={enviando}>Cancelar</Boton>
              <Boton primario onClick={() => void crear()} disabled={enviando || falta.length > 0 || !grupoId}>{enviando ? "Creando…" : "Crear iniciativa"}</Boton>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
