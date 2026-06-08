"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useMe } from "@/context/PermissionsContext";
import { hasAction, hasPage } from "@/lib/permissions";
import { pageByHref } from "@/lib/registry";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";

function FullScreen({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 text-[var(--text-muted)]">
      {children}
    </div>
  );
}

export default function AppLayout({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const { me, loading: meLoading, error: meError } = useMe();
  const router = useRouter();
  const pathname = usePathname();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Protege todas las rutas del grupo (app): sin sesión → /login.
  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  if (loading || !user || (meLoading && !me)) {
    return (
      <FullScreen>
        <div className="spinner" />
        <span>Cargando...</span>
      </FullScreen>
    );
  }

  // Error cargando permisos (p.ej. Admin SDK / Firestore sin configurar).
  if (meError && !me) {
    return (
      <FullScreen>
        <div
          className="max-w-md rounded-lg border px-6 py-5 text-center"
          style={{ background: "var(--pill-atrasado-bg)", borderColor: "var(--pill-atrasado-br)", color: "var(--pill-atrasado-fg)" }}
        >
          <strong>No se pudieron cargar tus permisos</strong>
          <br />
          {meError}
        </div>
      </FullScreen>
    );
  }

  // Gating por permiso de página (o acción para páginas de administración).
  const allowed = (() => {
    if (!me) return false;
    const page = pageByHref(pathname);
    if (!page) return true; // rutas no registradas → permitidas
    if (page.public) return true; // páginas públicas (informativas) → siempre permitidas
    if (page.requiredAction) return hasAction(me.permissions, page.requiredAction);
    return hasPage(me.permissions, page.key);
  })();

  return (
    <div className="flex">
      <Sidebar
        mobileOpen={mobileSidebarOpen}
        onClose={() => setMobileSidebarOpen(false)}
      />
      <div className="flex h-screen min-w-0 flex-1 flex-col overflow-y-auto">
        <Topbar onMenuClick={() => setMobileSidebarOpen(true)} />
        <main className="px-4 py-4 md:px-8 md:py-7">
          {allowed ? (
            children
          ) : (
            <div className="flex flex-col items-center gap-3 py-24 text-center">
              <div className="text-4xl opacity-30">🔒</div>
              <div className="text-lg font-semibold text-[var(--text-primary)]">Sin acceso</div>
              <div className="max-w-sm text-sm text-[var(--text-muted)]">
                No tienes permiso para ver esta sección. Pídele a un administrador que te lo habilite.
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
