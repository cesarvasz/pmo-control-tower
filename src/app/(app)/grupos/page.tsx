"use client";

import { useMemo, useState } from "react";
import { useGroups } from "@/context/GroupsContext";
import { authedFetch } from "@/lib/api";
import type { Group } from "@/lib/permissions";
import { PAGES } from "@/lib/registry";
import Modal from "@/components/Modal";
import { ErrorBox, Loader, SectionHeader } from "@/components/ui";

interface Draft {
  id: string | null; // null = nuevo
  name: string;
  icon: string;
  pageKeys: string[];
}

const ICONS = ["🗂", "📊", "📁", "🧭", "🚀", "📈", "🧩", "🏷", "⭐", "🔧"];

const emptyDraft = (): Draft => ({ id: null, name: "", icon: "🗂", pageKeys: [] });

export default function GruposPage() {
  const { groups, loading, error, refreshGroups } = useGroups();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);

  // Mapa pageKey → { id, name } del grupo que ya la tiene.
  const takenBy = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    for (const g of groups) {
      for (const key of g.pageKeys) {
        map.set(key, { id: g.id, name: g.name });
      }
    }
    return map;
  }, [groups]);

  const openNew = () => { setFormError(null); setDraft(emptyDraft()); };
  const openEdit = (g: Group) => {
    setFormError(null);
    setDraft({ id: g.id, name: g.name, icon: g.icon, pageKeys: [...g.pageKeys] });
  };

  const togglePage = (key: string, val: boolean) =>
    setDraft((d) =>
      d ? { ...d, pageKeys: val ? [...new Set([...d.pageKeys, key])] : d.pageKeys.filter((k) => k !== key) } : d
    );

  const saveDraft = async () => {
    if (!draft) return;
    if (!draft.name.trim()) { setFormError("El grupo necesita un nombre."); return; }
    setSaving(true);
    setFormError(null);
    try {
      const payload = { name: draft.name, icon: draft.icon, pageKeys: draft.pageKeys };
      const res = draft.id
        ? await authedFetch(`/api/groups/${draft.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await authedFetch("/api/groups", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
      setDraft(null);
      await refreshGroups();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  const removeGroup = async (g: Group) => {
    if (!confirm(`¿Eliminar el grupo "${g.name}"? Sus páginas volverán a quedar sueltas en el menú.`)) return;
    setPageError(null);
    try {
      const res = await authedFetch(`/api/groups/${g.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
      await refreshGroups();
    } catch (err) {
      setPageError(err instanceof Error ? err.message : "Error al eliminar");
    }
  };

  if (loading && !groups.length) return <Loader />;
  if (error && !groups.length) return <ErrorBox msg={error} />;

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <SectionHeader title="Grupos del menú" badge={`${groups.length}`} />
        <button onClick={openNew} className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--accent-hover)]">
          + Crear grupo
        </button>
      </div>
      <p className="mb-5 text-sm text-[var(--text-muted)]">
        Organiza las páginas en carpetas del menú lateral. Las páginas sin grupo aparecen sueltas.
        Un grupo puede concederse completo a un rol desde <span className="font-semibold text-[var(--accent-light)]">Roles</span>.
      </p>

      {pageError && <div className="mb-4"><ErrorBox msg={pageError} /></div>}

      {groups.length === 0 ? (
        <div className="rounded-xl border border-dashed px-6 py-12 text-center text-sm text-[var(--text-muted)]" style={{ borderColor: "var(--border)" }}>
          Aún no hay grupos. Crea el primero para empezar a organizar el menú.
        </div>
      ) : (
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))" }}>
          {groups.map((g) => {
            const pages = PAGES.filter((p) => g.pageKeys.includes(p.key));
            return (
              <div key={g.id} className="flex flex-col gap-3 rounded-xl border p-4" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="text-xl">{g.icon}</span>
                    <div>
                      <div className="text-[0.95rem] font-bold text-[var(--text-primary)]">{g.name}</div>
                      {g.isSystem && <div className="mt-0.5 text-[0.68rem] uppercase tracking-wide text-[var(--text-disabled)]">Grupo del sistema</div>}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => openEdit(g)} className="rounded-md border px-2.5 py-1 text-[0.75rem] text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]" style={{ borderColor: "var(--border)" }}>Editar</button>
                    {!g.isSystem && (
                      <button onClick={() => removeGroup(g)} className="rounded-md border px-2.5 py-1 text-[0.75rem] text-[var(--text-muted)] transition-colors hover:border-[#ef4444] hover:text-[#ef4444]" style={{ borderColor: "var(--border)" }}>Eliminar</button>
                    )}
                  </div>
                </div>
                <div>
                  <div className="mb-1 text-[0.68rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">Páginas</div>
                  {pages.length ? (
                    <div className="flex flex-wrap gap-1.5">
                      {pages.map((p) => (
                        <span key={p.key} className="rounded-md border px-2 py-0.5 text-[0.72rem] text-[var(--text-secondary)]" style={{ borderColor: "var(--border)", background: "var(--bg-base)" }}>
                          {p.icon} {p.label}
                          {p.requiredAction && <span className="ml-1 text-[var(--text-disabled)]">· acción</span>}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-[0.8rem] text-[var(--text-disabled)]">Sin páginas asignadas</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Editor */}
      <Modal open={draft !== null} onClose={() => setDraft(null)} width={520}>
        {draft && (
          <>
            <div className="flex items-center justify-between border-b px-6 pb-4 pt-5" style={{ borderColor: "var(--border)" }}>
              <span className="text-[1.05rem] font-bold text-[var(--text-primary)]">{draft.id ? "Editar grupo" : "Nuevo grupo"}</span>
              <button onClick={() => setDraft(null)} className="rounded-md px-1.5 text-xl leading-none text-[var(--text-muted)] hover:text-[var(--text-primary)]">✕</button>
            </div>
            <div className="flex flex-col gap-5 px-6 pb-6 pt-5">
              <label className="flex flex-col gap-1.5">
                <span className="text-[0.7rem] font-medium uppercase tracking-wide text-[var(--text-muted)]">Nombre del grupo</span>
                <input
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  placeholder="Ej. Tableros, Reportes…"
                  className="rounded-lg border px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
                  style={{ background: "var(--bg-base)", borderColor: "var(--border)", color: "var(--text-primary)" }}
                />
              </label>

              <div className="flex flex-col gap-1.5">
                <span className="text-[0.7rem] font-medium uppercase tracking-wide text-[var(--text-muted)]">Icono</span>
                <div className="flex flex-wrap gap-1.5">
                  {ICONS.map((ic) => (
                    <button
                      key={ic}
                      type="button"
                      onClick={() => setDraft({ ...draft, icon: ic })}
                      className="flex h-9 w-9 items-center justify-center rounded-lg border text-lg transition-colors"
                      style={{
                        borderColor: draft.icon === ic ? "var(--accent)" : "var(--border)",
                        background: draft.icon === ic ? "var(--bg-accent-soft)" : "var(--bg-base)",
                      }}
                    >
                      {ic}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-2 text-[0.68rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">Páginas del grupo</div>
                <div className="flex flex-col gap-2">
                  {PAGES.map((p) => {
                    // Una página tomada por OTRO grupo no se puede agregar aquí.
                    const owner = takenBy.get(p.key);
                    const takenByOther = owner !== undefined && owner.id !== draft.id;
                    const checked = draft.pageKeys.includes(p.key);
                    return (
                      <label
                        key={p.key}
                        className={`flex items-center gap-2.5 text-sm ${takenByOther ? "cursor-not-allowed opacity-50" : "cursor-pointer text-[var(--text-primary)]"}`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={takenByOther}
                          onChange={(e) => togglePage(p.key, e.target.checked)}
                          className="h-4 w-4 accent-[var(--accent)]"
                        />
                        <span className="flex-1">
                          {p.icon} {p.label}
                          {p.requiredAction && <span className="ml-1 text-[0.65rem] text-[var(--text-disabled)]">· acción</span>}
                        </span>
                        {takenByOther && (
                          <span className="text-[0.65rem] text-[var(--text-disabled)]">en {owner!.name}</span>
                        )}
                      </label>
                    );
                  })}
                </div>
              </div>

              {formError && (
                <div className="rounded-lg border px-3 py-2 text-xs" style={{ background: "var(--pill-atrasado-bg)", borderColor: "var(--pill-atrasado-br)", color: "var(--pill-atrasado-fg)" }}>{formError}</div>
              )}

              <div className="flex justify-end gap-2">
                <button onClick={() => setDraft(null)} className="rounded-lg border px-4 py-2 text-sm text-[var(--text-secondary)]" style={{ borderColor: "var(--border)" }}>Cancelar</button>
                <button onClick={saveDraft} disabled={saving} className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--accent-hover)] disabled:opacity-60">
                  {saving ? "Guardando..." : draft.id ? "Guardar cambios" : "Crear grupo"}
                </button>
              </div>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
