"use client";

import { useCallback, useEffect, useState } from "react";
import { authedFetch } from "@/lib/api";
import type { Permissions, Role } from "@/lib/permissions";
import { ACTIONS, PAGES, withCatalog } from "@/lib/registry";
import Modal from "@/components/Modal";
import { ErrorBox, Loader, SectionHeader } from "@/components/ui";

interface Draft {
  id: string | null; // null = nuevo
  name: string;
  permissions: Permissions;
  isSystem: boolean;
}

const emptyDraft = (): Draft => ({
  id: null,
  name: "",
  permissions: withCatalog({ pages: {}, actions: {} }),
  isSystem: false,
});

export default function RolesPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authedFetch("/api/roles");
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
      setRoles((await res.json()) as Role[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar roles");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => { await load(); })();
  }, [load]);

  const openNew = () => { setFormError(null); setDraft(emptyDraft()); };
  const openEdit = (r: Role) => {
    setFormError(null);
    setDraft({ id: r.id, name: r.name, permissions: withCatalog(r.permissions), isSystem: !!r.isSystem });
  };

  const togglePage = (key: string, val: boolean) =>
    setDraft((d) => (d ? { ...d, permissions: { ...d.permissions, pages: { ...d.permissions.pages, [key]: val } } } : d));
  const toggleAction = (key: string, val: boolean) =>
    setDraft((d) => (d ? { ...d, permissions: { ...d.permissions, actions: { ...d.permissions.actions, [key]: val } } } : d));

  const saveDraft = async () => {
    if (!draft) return;
    if (!draft.name.trim()) { setFormError("El rol necesita un nombre."); return; }
    setSaving(true);
    setFormError(null);
    try {
      const res = draft.id
        ? await authedFetch(`/api/roles/${draft.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: draft.name, permissions: draft.permissions }),
          })
        : await authedFetch("/api/roles", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: draft.name, permissions: draft.permissions }),
          });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
      setDraft(null);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  const removeRole = async (r: Role) => {
    if (!confirm(`¿Eliminar el rol "${r.name}"?`)) return;
    setError(null);
    try {
      const res = await authedFetch(`/api/roles/${r.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al eliminar");
    }
  };

  if (loading) return <Loader msg="Cargando roles..." />;
  if (error && !roles.length) return <ErrorBox msg={error} />;

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <SectionHeader title="Roles" badge={`${roles.length}`} />
        <button onClick={openNew} className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--accent-hover)]">
          + Crear rol
        </button>
      </div>

      {error && <div className="mb-4"><ErrorBox msg={error} /></div>}

      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))" }}>
        {roles.map((r) => {
          const pages = PAGES.filter((p) => r.permissions.pages[p.key]);
          const acts = ACTIONS.filter((a) => r.permissions.actions[a.key]);
          return (
            <div key={r.id} className="flex flex-col gap-3 rounded-xl border p-4" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-[0.95rem] font-bold text-[var(--text-primary)]">{r.name}</div>
                  {r.isSystem && <div className="mt-0.5 text-[0.68rem] uppercase tracking-wide text-[var(--text-disabled)]">Rol del sistema</div>}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => openEdit(r)} className="rounded-md border px-2.5 py-1 text-[0.75rem] text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]" style={{ borderColor: "var(--border)" }}>Editar</button>
                  {!r.isSystem && (
                    <button onClick={() => removeRole(r)} className="rounded-md border px-2.5 py-1 text-[0.75rem] text-[var(--text-muted)] transition-colors hover:border-[#ef4444] hover:text-[#ef4444]" style={{ borderColor: "var(--border)" }}>Eliminar</button>
                  )}
                </div>
              </div>
              <div>
                <div className="mb-1 text-[0.68rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">Puede ver</div>
                <div className="text-[0.8rem] text-[var(--text-secondary)]">{pages.length ? pages.map((p) => p.label).join(", ") : <span className="text-[var(--text-disabled)]">—</span>}</div>
              </div>
              <div>
                <div className="mb-1 text-[0.68rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">Puede hacer</div>
                <div className="text-[0.8rem]" style={{ color: "var(--accent-light)" }}>{acts.length ? acts.map((a) => a.label).join(", ") : <span className="text-[var(--text-disabled)]">—</span>}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Editor */}
      <Modal open={draft !== null} onClose={() => setDraft(null)} width={560}>
        {draft && (
          <>
            <div className="flex items-center justify-between border-b px-6 pb-4 pt-5" style={{ borderColor: "var(--border)" }}>
              <span className="text-[1.05rem] font-bold text-[var(--text-primary)]">{draft.id ? "Editar rol" : "Nuevo rol"}</span>
              <button onClick={() => setDraft(null)} className="rounded-md px-1.5 text-xl leading-none text-[var(--text-muted)] hover:text-[var(--text-primary)]">✕</button>
            </div>
            <div className="flex flex-col gap-5 px-6 pb-6 pt-5">
              <label className="flex flex-col gap-1.5">
                <span className="text-[0.7rem] font-medium uppercase tracking-wide text-[var(--text-muted)]">Nombre del rol</span>
                <input
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  placeholder="Ej. Coordinador, Auditor…"
                  className="rounded-lg border px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
                  style={{ background: "var(--bg-base)", borderColor: "var(--border)", color: "var(--text-primary)" }}
                />
              </label>

              <div>
                <div className="mb-2 text-[0.68rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">Puede ver (páginas)</div>
                <div className="flex flex-col gap-2">
                  {PAGES.map((p) => (
                    <label key={p.key} className="flex cursor-pointer items-center gap-2.5 text-sm text-[var(--text-primary)]">
                      <input type="checkbox" checked={!!draft.permissions.pages[p.key]} onChange={(e) => togglePage(p.key, e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
                      <span>{p.icon} {p.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-2 text-[0.68rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">Puede hacer (acciones)</div>
                <div className="flex flex-col gap-2">
                  {ACTIONS.map((a) => (
                    <label key={a.key} className="flex cursor-pointer items-start gap-2.5 text-sm text-[var(--text-primary)]">
                      <input type="checkbox" checked={!!draft.permissions.actions[a.key]} onChange={(e) => toggleAction(a.key, e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--accent)]" />
                      <span>{a.label}<span className="block text-[0.72rem] text-[var(--text-muted)]">{a.description}</span></span>
                    </label>
                  ))}
                </div>
              </div>

              {formError && (
                <div className="rounded-lg border px-3 py-2 text-xs" style={{ background: "var(--pill-atrasado-bg)", borderColor: "var(--pill-atrasado-br)", color: "var(--pill-atrasado-fg)" }}>{formError}</div>
              )}

              <div className="flex justify-end gap-2">
                <button onClick={() => setDraft(null)} className="rounded-lg border px-4 py-2 text-sm text-[var(--text-secondary)]" style={{ borderColor: "var(--border)" }}>Cancelar</button>
                <button onClick={saveDraft} disabled={saving} className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--accent-hover)] disabled:opacity-60">
                  {saving ? "Guardando..." : draft.id ? "Guardar cambios" : "Crear rol"}
                </button>
              </div>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
