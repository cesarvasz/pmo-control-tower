"use client";

import { useEffect, useMemo, useState } from "react";
import { useMe } from "@/context/PermissionsContext";
import { useGroups } from "@/context/GroupsContext";
import { authedFetch } from "@/lib/api";
import type { AppUser, Role } from "@/lib/permissions";
import { ACTIONS, PAGES, resolvePermissions } from "@/lib/registry";
import { ErrorBox, Loader, SectionHeader } from "@/components/ui";

export default function UsuariosPage() {
  const { me } = useMe();
  const { groups } = useGroups();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [savingUid, setSavingUid] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [uRes, rRes] = await Promise.all([authedFetch("/api/users"), authedFetch("/api/roles")]);
        if (!uRes.ok) throw new Error((await uRes.json().catch(() => ({}))).error || `HTTP ${uRes.status}`);
        if (!rRes.ok) throw new Error((await rRes.json().catch(() => ({}))).error || `HTTP ${rRes.status}`);
        setUsers((await uRes.json()) as AppUser[]);
        setRoles((await rRes.json()) as Role[]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al cargar");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const rolesById = useMemo(() => new Map(roles.map((r) => [r.id, r])), [roles]);

  const changeRole = (uid: string, roleId: string) => {
    setUsers((list) => list.map((u) => (u.uid === uid ? { ...u, roleId } : u)));
    setDirty((s) => new Set(s).add(uid));
  };

  const save = async (u: AppUser) => {
    setSavingUid(u.uid);
    setError(null);
    try {
      const res = await authedFetch(`/api/users/${u.uid}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleId: u.roleId }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
      const updated = (await res.json()) as AppUser;
      setUsers((list) => list.map((x) => (x.uid === u.uid ? updated : x)));
      setDirty((s) => { const n = new Set(s); n.delete(u.uid); return n; });
      setToast(`Guardado: ${u.email}`);
      setTimeout(() => setToast(null), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSavingUid(null);
    }
  };

  if (loading) return <Loader msg="Cargando usuarios..." />;
  if (error && !users.length) return <ErrorBox msg={error} />;

  return (
    <div>
      <SectionHeader title="Gestión de Usuarios" badge={`${users.length} usuario${users.length !== 1 ? "s" : ""}`} />
      <p className="mb-5 text-sm text-[var(--text-muted)]">
        Asigna un rol a cada usuario. Los permisos (qué ve y qué hace) los define el rol — créalos y edítalos en{" "}
        <span className="font-semibold text-[var(--accent-light)]">Roles</span>.
      </p>

      {error && <div className="mb-4"><ErrorBox msg={error} /></div>}
      {toast && (
        <div className="mb-4 rounded-lg border px-4 py-2.5 text-sm" style={{ background: "var(--pill-entiempo-bg)", borderColor: "var(--pill-entiempo-br)", color: "var(--pill-entiempo-fg)" }}>
          ✓ {toast}
        </div>
      )}

      <div className="table-wrap">
        <table className="pmo">
          <thead>
            <tr>
              <th>Usuario</th>
              <th>Rol</th>
              <th>Acceso del rol</th>
              <th style={{ textAlign: "right" }}>Acción</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const isSelf = me?.uid === u.uid;
              const isDirty = dirty.has(u.uid);
              const role = u.roleId ? rolesById.get(u.roleId) : undefined;
              const eff = role ? resolvePermissions(role.permissions, groups) : null;
              const grantedPages = eff ? PAGES.filter((p) => eff.pages[p.key]).map((p) => p.label) : [];
              const grantedActions = eff ? ACTIONS.filter((a) => eff.actions[a.key]).map((a) => a.label) : [];
              return (
                <tr key={u.uid}>
                  <td>
                    <div className="ini-name">{u.displayName || u.email}{isSelf && <span className="ml-2 text-[0.7rem] text-[var(--accent-light)]">(tú)</span>}</div>
                    <div style={{ fontSize: ".75rem", color: "var(--text-muted)" }}>{u.email}</div>
                  </td>
                  <td>
                    <select
                      value={u.roleId ?? ""}
                      onChange={(e) => changeRole(u.uid, e.target.value)}
                      className="rounded-md border px-2 py-1 text-sm"
                      style={{ background: "var(--bg-base)", borderColor: "var(--border)", color: "var(--text-primary)" }}
                    >
                      {!u.roleId && <option value="">(sin rol)</option>}
                      {roles.map((r) => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                      ))}
                    </select>
                  </td>
                  <td style={{ fontSize: ".78rem", color: "var(--text-secondary)", maxWidth: 360 }}>
                    {grantedPages.length === 0 && grantedActions.length === 0 ? (
                      <span className="text-[var(--text-disabled)]">Sin acceso</span>
                    ) : (
                      <>
                        {grantedPages.join(", ")}
                        {grantedActions.length > 0 && (
                          <span style={{ color: "var(--accent-light)" }}> · {grantedActions.join(", ")}</span>
                        )}
                      </>
                    )}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <button
                      onClick={() => save(u)}
                      disabled={!isDirty || savingUid === u.uid}
                      className="rounded-md px-3 py-1.5 text-[0.8rem] font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                      style={{ background: isDirty ? "var(--accent)" : "var(--accent-dim)" }}
                    >
                      {savingUid === u.uid ? "Guardando..." : "Guardar"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
