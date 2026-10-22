"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useMe } from "@/context/PermissionsContext";
import { useData } from "@/context/DataContext";
import { canSeePage, pageByHref, pageByKey } from "@/lib/registry";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import ErrorBoundary from "@/components/ErrorBoundary";
import { Loader } from "@/components/ui";

function FullScreen({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 text-[var(--text-muted)]">
      {children}
    </div>
  );
}

/** Overlay que cubre la pantalla mientras se actualizan los datos (refetch con data ya cargada). */
function RefreshOverlay() {
  const { loading, data } = useData();
  if (!loading || !data) return null;
  return (
    <div
      className="fixed inset-0 z-[200] flex flex-col items-center justify-center gap-4 print:hidden"
      style={{ background: "var(--bg-base)" }}
      role="status"
      aria-live="polite"
    >
      <img className="loader-pmo loader-pmo--light" src="/loader-pmo-verde.svg" alt="" />
      <img className="loader-pmo loader-pmo--dark" src="/loader-pmo-blanco.svg" alt="" />
      <span className="sr-only">Procesando…</span>
    </div>
  );
}

/** Aviso para quien ve una versión recortada de los datos (rol Sponsor): de quién es el alcance,
 *  o por qué no hay nada que mostrar si su correo no está en el Directorio RH. */
function AlcanceBanner() {
  const { alcance } = useData();
  if (!alcance) return null;
  return (
    <div
      className="mb-4 rounded-lg border px-4 py-2.5 text-[0.82rem] print:hidden"
      style={{ background: "var(--bg-accent-soft)", borderColor: "var(--border)", color: "var(--text-secondary)" }}
      role="note"
    >
      {alcance.nombre
        ? <>Estás viendo solo lo ligado a tu nombre como {alcance.rol}: <strong className="text-[var(--text-primary)]">{alcance.nombre}</strong>.</>
        : <>Tu usuario tiene el rol {alcance.rol}, pero tu correo no está asociado a nadie en el Directorio RH, así que no hay información para mostrarte. Pide a un Admin que lo revise.</>}
    </div>
  );
}

export default function AppLayout({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const { me, loading: meLoading, error: meError } = useMe();
  const router = useRouter();
  const pathname = usePathname();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const landedRef = useRef(false);

  // Protege todas las rutas del grupo (app): sin sesión → /login.
  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  // Página principal por usuario: la primera vez que esta sesión de la app
  // llega a "/" (recién logueado, o tras recargar), si el usuario tiene una
  // página principal configurada (Usuarios → Página principal) lo manda ahí
  // en vez de Control Tower. Solo una vez por carga — no vuelve a interceptar
  // si el usuario navega a "/" después por su cuenta (p.ej. desde el sidebar).
  useEffect(() => {
    if (landedRef.current || !me || pathname !== "/") return;
    landedRef.current = true;
    if (!me.defaultPage) return;
    const target = pageByKey(me.defaultPage);
    if (target && target.key !== "overview" && canSeePage(me.permissions, target)) {
      router.replace(target.href);
    }
  }, [me, pathname, router]);

  if (loading || !user || (meLoading && !me)) {
    return (
      <FullScreen>
        <Loader />
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
    return canSeePage(me.permissions, page);
  })();

  return (
    <div className="flex">
      <RefreshOverlay />
      <div className="print:hidden">
        <Sidebar
          mobileOpen={mobileSidebarOpen}
          onClose={() => setMobileSidebarOpen(false)}
        />
      </div>
      <div className="flex h-screen min-w-0 flex-1 flex-col overflow-y-auto print:h-auto print:overflow-visible">
        <div className="print:hidden">
          <Topbar onMenuClick={() => setMobileSidebarOpen(true)} />
        </div>
        <main className="px-4 py-4 md:px-8 md:py-7 print:p-0">
          {allowed && <AlcanceBanner />}
          {allowed ? (
            <ErrorBoundary key={pathname}>{children}</ErrorBoundary>
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
