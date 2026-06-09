"use client";

import { useRouter } from "next/navigation";
import { useData } from "@/context/DataContext";
import { calcIniPMHealth, INI_ACTIVE_STS, iniIsParaHoy, PROJ_ACTIVE_STS, REQ_ACTIVE_GRUPOS } from "@/lib/process";
import type { IniItem, ProjBoard, ProjItem, ReqItem } from "@/types";
import { ErrorBox, Loader } from "@/components/ui";

const PM_PORTFOLIO: Record<string, { prefix: string; name: string }> = {
  "Luis Aguilar": { prefix: "α", name: "Portafolio Alfa" },
  "David Guzmán": { prefix: "β", name: "Portafolio Beta" },
  "Daniela Alvarez": { prefix: "γ", name: "Portafolio Gamma" },
};
const pmLabel = (pm: string) => {
  const p = PM_PORTFOLIO[pm];
  return p ? `${p.prefix} ${p.name}` : pm;
};

const HEALTH_CFG: Record<string, { color: string; bg: string; label: string; icon: string }> = {
  "on-track": { color: "#10b981", bg: "#052e1688", label: "On Track", icon: "✓" },
  "at-risk":  { color: "#f59e0b", bg: "#451a0388", label: "At Risk",  icon: "⚠" },
  "off-track":{ color: "#ef4444", bg: "#450a0a88", label: "Off Track", icon: "✕" },
};
const INI_HEALTH_CFG: Record<string, { color: string; bg: string; label: string; icon: string }> = {
  "on-track": { color: "#10b981", bg: "#052e1688", label: "On Track", icon: "✓" },
  "at-risk":  { color: "#f59e0b", bg: "#451a0388", label: "In Risk",  icon: "⚠" },
  "off-track":{ color: "#ef4444", bg: "#450a0a88", label: "Off Track", icon: "✕" },
};

export default function ControlTowerPage() {
  const { data, loading, error } = useData();
  const router = useRouter();

  if (loading && !data) return <Loader msg="Cargando portafolios..." />;
  if (error) return <ErrorBox msg={error} />;
  if (!data) return null;

  const { ini, req, proj, projBoards, calMap } = data;
  const iniProc = ini.filter((r) => INI_ACTIVE_STS.has(r.status));
  const reqProc = req.filter((r) => REQ_ACTIVE_GRUPOS.has(r.grupo));

  const G = {
    iniTotal: iniProc.length,
    iniAtrasado: iniProc.filter((r) => r.estado === "ATRASADO").length,
    iniParaHoy: ini.filter((r) => iniIsParaHoy(r, calMap)).length,
    iniEnTiempo: iniProc.filter((r) => r.estado === "EN TIEMPO" && !iniIsParaHoy(r, calMap)).length,
    reqTotal: reqProc.length,
    reqAtrasado: reqProc.filter((r) => r.estado === "ATRASADO").length,
    reqParaHoy: reqProc.filter((r) => r.estado === "PARA HOY").length,
    reqEnTiempo: reqProc.filter((r) => r.estado === "EN TIEMPO").length,
    projTotal: projBoards.length,
    projAtrasado: proj.filter((r) => r.estado === "ATRASADO").length,
    projParaHoy: proj.filter((r) => r.estado === "PARA HOY").length,
    projEnTiempo: proj.filter((r) => r.estado === "EN TIEMPO").length,
  };

  // ── Índice de salud ──
  const enTiempo = iniProc.filter((r) => r.estado === "EN TIEMPO").length + reqProc.filter((r) => r.estado === "EN TIEMPO").length + proj.filter((r) => r.estado === "EN TIEMPO").length;
  const paraHoy = iniProc.filter((r) => r.estado === "PARA HOY").length + reqProc.filter((r) => r.estado === "PARA HOY").length + proj.filter((r) => r.estado === "PARA HOY").length;
  const atrasado = iniProc.filter((r) => r.estado === "ATRASADO").length + reqProc.filter((r) => r.estado === "ATRASADO").length + proj.filter((r) => r.estado === "ATRASADO").length;
  const hTotal = enTiempo + paraHoy + atrasado;
  const healthPct = hTotal === 0 ? 100 : Math.round(((enTiempo + paraHoy * 0.5) / hTotal) * 100);
  const hColor = healthPct >= 80 ? "#10b981" : healthPct >= 50 ? "#f59e0b" : "#ef4444";
  const hBg = healthPct >= 80 ? "#052e1688" : healthPct >= 50 ? "#451a0388" : "#450a0a88";
  const hLabel = healthPct >= 80 ? "Saludable" : healthPct >= 50 ? "En Riesgo" : "Crítico";
  const hIcon = healthPct >= 80 ? "✓" : healthPct >= 50 ? "⚠" : "✕";

  const PM_ORDER = Object.keys(PM_PORTFOLIO); // α → β → γ
  const allPMs = [...new Set([
    ...ini.filter((r) => r.pm && r.estado !== "SKIP").map((r) => r.pm),
    ...req.filter((r) => r.pm && r.estado !== "CERRADO").map((r) => r.pm),
  ])].sort((a, b) => {
    const ia = PM_ORDER.indexOf(a);
    const ib = PM_ORDER.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });

  return (
    <div>
      {/* Health index */}
      <div className="mb-4 rounded-xl border-2 p-6" style={{ background: "var(--bg-surface)", borderColor: hColor }}>
        <div className="mb-4 text-[0.72rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">
          Índice de Salud del Portafolio PMO
        </div>
        <div className="mb-3.5 flex flex-wrap items-center gap-5">
          <div className="text-5xl font-extrabold leading-none" style={{ color: hColor, minWidth: 88 }}>{healthPct}%</div>
          <div className="h-2.5 min-w-[120px] flex-1 overflow-hidden rounded-full" style={{ background: "var(--border)" }}>
            <div className="h-full rounded-full transition-all" style={{ width: `${healthPct}%`, background: hColor }} />
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[0.82rem] font-bold" style={{ color: hColor, background: hBg }}>{hIcon} {hLabel}</span>
        </div>
        <div className="flex flex-wrap gap-5 text-[0.82rem] font-semibold">
          <span style={{ color: "#10b981" }}>✓ {enTiempo} en tiempo</span>
          <span style={{ color: "#f59e0b" }}>⚠ {paraHoy} para hoy</span>
          <span style={{ color: "#ef4444" }}>✕ {atrasado} atrasados</span>
          <span className="text-[var(--text-muted)]">{hTotal} activos totales</span>
        </div>
      </div>

      {/* Bloques globales */}
      <div className="mb-2 flex flex-wrap rounded-xl border p-5" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
        <GlobalBlock title="Iniciativas" onClick={() => router.push("/iniciativas")} stats={[
          [`${G.iniTotal} total`, "var(--text-primary)"],
          [`${G.iniAtrasado} atrasadas`, "#ef4444"],
          [`${G.iniParaHoy} para hoy`, "#f59e0b"],
          [`${G.iniEnTiempo} en tiempo`, "#10b981"],
        ]} />
        <div className="mx-1 w-px self-stretch" style={{ background: "var(--border)" }} />
        <GlobalBlock title="REQ" onClick={() => router.push("/req")} stats={[
          [`${G.reqTotal} total`, "var(--text-primary)"],
          [`${G.reqAtrasado} atrasados`, "#ef4444"],
          [`${G.reqParaHoy} para hoy`, "#f59e0b"],
          [`${G.reqEnTiempo} en tiempo`, "#10b981"],
        ]} />
        <div className="mx-1 w-px self-stretch" style={{ background: "var(--border)" }} />
        <GlobalBlock title="Proyectos" onClick={() => router.push("/proyectos")} stats={[
          [`${G.projTotal} total`, "var(--text-primary)"],
          [`${G.projAtrasado} off track`, "#ef4444"],
          [`${G.projParaHoy + G.projEnTiempo} on track`, "#10b981"],
        ]} />
      </div>

      {/* Portafolios por PM */}
      <div className="mb-4 mt-6 flex items-center gap-2.5">
        <h2 className="text-base font-semibold text-[var(--text-primary)]">Portafolios por PM</h2>
        <span className="rounded-full bg-[var(--bg-hover)] px-2 py-0.5 text-[0.72rem] text-[var(--text-secondary)]">{allPMs.length} PM{allPMs.length !== 1 ? "s" : ""}</span>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {allPMs.map((pm) => {
          const q = encodeURIComponent(pm);
          return (
            <PMPortfolioCard key={pm} pm={pm} ini={ini} req={req} proj={proj} projBoards={projBoards} calMap={calMap} onGoIni={() => router.push(`/iniciativas?pm=${q}`)} onGoReq={() => router.push(`/req?pm=${q}`)} onGoProj={() => router.push(`/proyectos?pm=${q}`)} />
          );
        })}
      </div>
    </div>
  );
}

function GlobalBlock({ title, stats, onClick }: { title: string; stats: [string, string][]; onClick: () => void }) {
  return (
    <div onClick={onClick} className="min-w-[200px] flex-1 cursor-pointer rounded-lg px-5 py-1.5 transition-colors hover:bg-[var(--bg-hover)]">
      <div className="mb-2.5 text-[0.75rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">
        {title} <span className="text-[0.72rem] opacity-50">→ ver dashboard</span>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        {stats.map(([txt, color], i) => (
          <span key={i} className="text-[0.88rem] font-semibold" style={{ color }}>{txt}</span>
        ))}
      </div>
    </div>
  );
}

function Stat({ n, color, label, showZero }: { n: number; color: string; label: string; showZero?: boolean }) {
  if (n <= 0 && !showZero) return null;
  return (
    <div className="flex items-center gap-1.5 text-[0.82rem] text-[var(--text-secondary)]">
      <span className="h-[7px] w-[7px] flex-shrink-0 rounded-full" style={{ background: color }} />
      {n} {label}
    </div>
  );
}

function PMPortfolioCard({
  pm, ini, req, proj, projBoards, calMap, onGoIni, onGoReq, onGoProj,
}: {
  pm: string; ini: IniItem[]; req: ReqItem[]; proj: ProjItem[]; projBoards: ProjBoard[]; calMap: import("@/types").CalMap;
  onGoIni: () => void; onGoReq: () => void; onGoProj: () => void;
}) {
  const iniHealth = calcIniPMHealth(pm, ini, calMap);
  const iniHas = true;

  const reqItems = req.filter((r) => r.pm === pm && r.estado !== "CERRADO");
  const reqAct = reqItems.filter((r) => REQ_ACTIVE_GRUPOS.has(r.grupo));
  const rAtr = reqAct.filter((r) => r.estado === "ATRASADO").length;
  const reqVemItems = reqAct.filter((r) => r.vem != null);
  const reqAvgVem = reqVemItems.length ? reqVemItems.reduce((s, r) => s + (r.vem as number), 0) / reqVemItems.length : null;
  const reqVemStatus = reqAvgVem !== null ? (reqAvgVem >= 0.95 ? "on-track" : reqAvgVem >= 0.85 ? "at-risk" : "off-track") : null;
  const rvc = reqVemStatus ? INI_HEALTH_CFG[reqVemStatus] : null;

  const reqParaHoyN = reqAct.filter((r) => r.estado === "PARA HOY").length;
  const reqEnTiempoN = reqAct.filter((r) => r.estado === "EN TIEMPO").length;
  const reqEnEsperaN = reqItems.filter((r) => r.estado === "EN_ESPERA").length;
  const reqHas = reqAct.length > 0 || reqEnEsperaN > 0;

  const pmProjBoards = projBoards.filter((b) => b.pm === pm);
  const ids = new Set(pmProjBoards.map((b) => b.id));
  const projAct = proj.filter((r) => ids.has(r.boardId) && PROJ_ACTIVE_STS.has(r.status));
  const projAtrN = projAct.filter((r) => r.estado === "ATRASADO").length;
  const projHas = pmProjBoards.length > 0;

  const totalAtr = iniHealth.atrasadas + rAtr + projAtrN;

  const health = totalAtr === 0 ? "on-track" : totalAtr <= 2 ? "at-risk" : "off-track";
  const hc = HEALTH_CFG[health];
  const ihc = INI_HEALTH_CFG[iniHealth.status];

  return (
    <div className="overflow-hidden rounded-xl border-2" style={{ background: "var(--bg-surface)", borderColor: hc.color }}>
      <div className="flex items-center justify-between border-b px-[18px] py-3.5" style={{ borderColor: "var(--border)" }}>
        <div>
          <span className="text-[0.95rem] font-bold text-[var(--text-primary)]">{pmLabel(pm)}</span>
          <div className="mt-0.5 text-[0.75rem] text-[var(--text-muted)]">PM · {pm}</div>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[0.75rem] font-bold" style={{ color: hc.color, background: hc.bg }}>{hc.icon} {hc.label}</span>
      </div>
      <div className="flex">
        <Section
          label="Iniciativas"
          has={iniHas}
          onClick={onGoIni}
          badge={iniHas ? (
            <span className="rounded-full px-1.5 py-0.5 text-[0.62rem] font-bold leading-none" style={{ color: ihc.color, background: ihc.bg }}>
              {ihc.icon} {Math.round(iniHealth.index * 100)}%
            </span>
          ) : undefined}
        >
          <Stat n={iniHealth.total} color="#6b7280" label="total" showZero />
          <Stat n={iniHealth.atrasadas} color="#ef4444" label={`atrasada${iniHealth.atrasadas !== 1 ? "s" : ""}`} />
          <Stat n={iniHealth.enTiempo} color="#10b981" label="en tiempo" />
          <Stat n={iniHealth.sinMeeting} color="#f59e0b" label="sin agendar" />
        </Section>
        <div className="w-px flex-shrink-0" style={{ background: "var(--border)" }} />
        <Section
          label="REQ"
          has={reqHas}
          onClick={onGoReq}
          badge={rvc ? (
            <span className="rounded-full px-1.5 py-0.5 text-[0.62rem] font-bold leading-none" style={{ color: rvc.color, background: rvc.bg }}>
              {rvc.icon} {Math.round((reqAvgVem as number) * 100)}%
            </span>
          ) : undefined}
        >
          <Stat n={reqAct.length} color="#6b7280" label="total" />
          <Stat n={rAtr} color="#ef4444" label={`atrasado${rAtr !== 1 ? "s" : ""}`} />
          <Stat n={reqParaHoyN} color="#f59e0b" label="para hoy" />
          <Stat n={reqEnTiempoN} color="#10b981" label="en tiempo" />
        </Section>
        <div className="w-px flex-shrink-0" style={{ background: "var(--border)" }} />
        <Section label={`Proyectos (${pmProjBoards.length})`} has={projHas} onClick={onGoProj}>
          {pmProjBoards.map((b) => {
            const bItems = proj.filter((r) => r.boardId === b.id && PROJ_ACTIVE_STS.has(r.status));
            const bAtr = bItems.filter((r) => r.estado === "ATRASADO").length;
            const bOn = bItems.filter((r) => r.estado === "EN TIEMPO" || r.estado === "PARA HOY").length;
            return (
              <div key={b.id} className="flex items-center gap-1.5 border-b py-[3px]" style={{ borderColor: "var(--border)" }}>
                <span className="font-mono text-[0.75rem] font-bold text-[var(--text-primary)]" title={b.name}>{b.name.slice(0, 6)}</span>
                <span className="flex items-center gap-1.5">
                  {bAtr > 0 && <span style={{ color: "#ef4444", fontWeight: 700, fontSize: ".72rem" }}>{bAtr}✕</span>}
                  {bOn > 0 && <span style={{ color: "#10b981", fontWeight: 700, fontSize: ".72rem" }}>{bOn}✓</span>}
                  {bAtr + bOn === 0 && <span className="text-[var(--text-disabled)] text-[.72rem]">—</span>}
                </span>
              </div>
            );
          })}
        </Section>
      </div>
    </div>
  );
}

function Section({ label, has, onClick, children, badge }: { label: string; has: boolean; onClick: () => void; children: React.ReactNode; badge?: React.ReactNode }) {
  return (
    <div onClick={has ? onClick : undefined} className={`min-w-0 flex-1 px-[18px] py-3.5 transition-colors ${has ? "cursor-pointer hover:bg-[var(--bg-hover)]" : ""}`}>
      <div className="mb-2 flex items-center gap-1.5">
        <span className="text-[0.7rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">{label}</span>
        {badge}
      </div>
      {has ? <div className="flex flex-col gap-1.5">{children}</div> : <div className="pt-1 text-[0.8rem] text-[var(--text-disabled)]">Sin datos</div>}
    </div>
  );
}
