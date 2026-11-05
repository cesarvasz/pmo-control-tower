"use client";

import { useEffect, useMemo, useState } from "react";
import { useMe } from "@/context/PermissionsContext";
import { useGroups } from "@/context/GroupsContext";
import { authedFetch } from "@/lib/api";
import type { AppUser, Role } from "@/lib/permissions";
import { ACTIONS, canSeePage, PAGES, resolvePermissions } from "@/lib/registry";
import { ErrorBox, Loader, SectionHeader } from "@/components/ui";
import Modal from "@/components/Modal";

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
  // Las cuentas en espera (sin rol) van primero: son las que el Admin tiene que atender.
  const ordenados = useMemo(
    () => [...users].sort((a, b) => Number(!!a.roleId) - Number(!!b.roleId) || a.email.localeCompare(b.email)),
    [users],
  );
  const enEspera = users.filter((u) => !u.roleId).length;

  // Contraseña temporal recién generada: se muestra UNA vez en el modal.
  const [temporal, setTemporal] = useState<{ email: string; password: string } | null>(null);
  const [copiada, setCopiada] = useState(false);
  const [generandoUid, setGenerandoUid] = useState<string | null>(null);

  const ponerTemporal = async (u: AppUser) => {
    if (!window.confirm(`¿Generar una contraseña temporal para ${u.email}?\n\nSu contraseña actual dejará de funcionar y tendrá que crear una nueva al entrar.`)) return;
    setGenerandoUid(u.uid);
    setError(null);
    try {
      const res = await authedFetch(`/api/users/${u.uid}/password`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
      const { password } = (await res.json()) as { password: string };
      setUsers((list) => list.map((x) => (x.uid === u.uid ? { ...x, mustChangePassword: true } : x)));
      setCopiada(false);
      setTemporal({ email: u.email, password });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al generar la contraseña");
    } finally {
      setGenerandoUid(null);
    }
  };

  const copiar = async () => {
    if (!temporal) return;
    try {
      await navigator.clipboard.writeText(temporal.password);
      setCopiada(true);
    } catch {
      setCopiada(false);
    }
  };

  const changeRole = (uid: string, roleId: string) => {
    setUsers((list) => list.map((u) => (u.uid === uid ? { ...u, roleId } : u)));
    setDirty((s) => new Set(s).add(uid));
  };

  const changeDefaultPage = (uid: string, defaultPage: string) => {
    setUsers((list) => list.map((u) => (u.uid === uid ? { ...u, defaultPage: defaultPage || null } : u)));
    setDirty((s) => new Set(s).add(uid));
  };

  const save = async (u: AppUser) => {
    setSavingUid(u.uid);
    setError(null);
    try {
      const res = await authedFetch(`/api/users/${u.uid}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleId: u.roleId, defaultPage: u.defaultPage }),
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

  if (loading) return <Loader />;
  if (error && !users.length) return <ErrorBox msg={error} />;

  return (
    <div>
      <SectionHeader
        title="Gestión de Usuarios"
        badge={`${users.length} usuario${users.length !== 1 ? "s" : ""}${enEspera ? ` · ${enEspera} en espera` : ""}`}
      />
      <p className="mb-5 text-sm text-[var(--text-muted)]">
        Asigna un rol a cada usuario. Los permisos (qué ve y qué hace) los define el rol — créalos y edítalos en{" "}
        <span className="font-semibold text-[var(--accent-light)]">Roles</span>. Las cuentas <strong>en espera</strong> se
        registraron solas y no ven nada hasta que les asignes un rol. Con <strong>🔑 Temporal</strong> le das a alguien una
        contraseña para entrar (usuarios migrados u olvido de contraseña); la tendrá que cambiar al ingresar.
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
              <th>Página principal</th>
              <th>Acceso del rol</th>
              <th style={{ textAlign: "right" }}>Acción</th>
            </tr>
          </thead>
          <tbody>
            {ordenados.map((u) => {
              const isSelf = me?.uid === u.uid;
              const isDirty = dirty.has(u.uid);
              const role = u.roleId ? rolesById.get(u.roleId) : undefined;
              const eff = role ? resolvePermissions(role.permissions, groups) : null;
              const grantedPages = eff ? PAGES.filter((p) => eff.pages[p.key]).map((p) => p.label) : [];
              const grantedActions = eff ? ACTIONS.filter((a) => eff.actions[a.key]).map((a) => a.label) : [];
              // Solo páginas de contenido que este usuario puede ver con su rol actual
              // (sin sentido mandarlo de landing a una página a la que no tiene acceso).
              const landingOptions = eff ? PAGES.filter((p) => p.key !== "overview" && !p.requiredAction && canSeePage(eff, p)) : [];
              return (
                <tr key={u.uid}>
                  <td>
                    <div className="ini-name">{u.displayName || u.email}{isSelf && <span className="ml-2 text-[0.7rem] text-[var(--accent-light)]">(tú)</span>}</div>
                    <div style={{ fontSize: ".75rem", color: "var(--text-muted)" }}>{u.email}</div>
                    {!u.roleId && (
                      <span className="mt-1 inline-block rounded-full border px-2 py-0.5 text-[0.68rem] font-semibold" style={{ background: "var(--pill-parahoy-bg)", borderColor: "var(--pill-parahoy-br)", color: "var(--pill-parahoy-fg)" }}>
                        En espera · asígnale un rol
                      </span>
                    )}
                    {u.mustChangePassword && (
                      <div className="mt-1 text-[0.7rem] text-[var(--text-muted)]">🔑 Con contraseña temporal (aún no la cambia)</div>
                    )}
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
                  <td>
                    <select
                      value={u.defaultPage ?? ""}
                      onChange={(e) => changeDefaultPage(u.uid, e.target.value)}
                      disabled={landingOptions.length === 0}
                      className="rounded-md border px-2 py-1 text-sm disabled:opacity-40"
                      style={{ background: "var(--bg-base)", borderColor: "var(--border)", color: "var(--text-primary)" }}
                    >
                      <option value="">Control Tower (por defecto)</option>
                      {landingOptions.map((p) => (
                        <option key={p.key} value={p.key}>{p.label}</option>
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
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    {!isSelf && (
                      <button
                        onClick={() => ponerTemporal(u)}
                        disabled={generandoUid === u.uid}
                        title="Generar una contraseña temporal para este usuario"
                        className="mr-2 rounded-md border px-2.5 py-1.5 text-[0.8rem] text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-40"
                        style={{ borderColor: "var(--border)" }}
                      >
                        {generandoUid === u.uid ? "Generando..." : "🔑 Temporal"}
                      </button>
                    )}
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

      <Modal open={!!temporal} onClose={() => setTemporal(null)} width={440} label="Contraseña temporal">
        {temporal && (
          <div className="p-6">
            <div className="mb-1 text-base font-semibold text-[var(--text-primary)]">Contraseña temporal</div>
            <p className="mb-4 text-sm text-[var(--text-muted)]">
              Pásasela a <strong className="text-[var(--text-secondary)]">{temporal.email}</strong> por un canal privado.
              No se vuelve a mostrar: si se pierde, genera otra.
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded-lg border px-3 py-2 text-center text-lg tracking-wider text-[var(--text-primary)]" style={{ borderColor: "var(--border)", background: "var(--bg-base)" }}>
                {temporal.password}
              </code>
              <button
                onClick={copiar}
                className="rounded-md bg-[var(--accent)] px-3 py-2 text-[0.8rem] text-white transition-colors hover:bg-[var(--accent-hover)]"
              >
                {copiada ? "✓ Copiada" : "Copiar"}
              </button>
            </div>
            <p className="mt-4 text-[0.75rem] text-[var(--text-muted)]">Al entrar con ella, la app le pedirá crear su propia contraseña.</p>
          </div>
        )}
      </Modal>
    </div>
  );
}
