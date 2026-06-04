"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useMe } from "@/context/PermissionsContext";
import { hasAction, hasPage } from "@/lib/permissions";
import { PAGES } from "@/lib/registry";

export default function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const { me } = useMe();

  // Navegación filtrada por permisos del usuario.
  const navItems: { href: string; label: string; icon: string }[] = PAGES.filter(
    (p) => hasPage(me?.permissions, p.key)
  ).map((p) => ({ href: p.href, label: p.label, icon: p.icon }));
  if (hasAction(me?.permissions, "manage_users")) {
    navItems.push({ href: "/usuarios", label: "Usuarios", icon: "⚙" });
  }
  if (hasAction(me?.permissions, "manage_roles")) {
    navItems.push({ href: "/roles", label: "Roles", icon: "🛡" });
  }

  return (
    <nav
      className="sticky top-0 z-[100] flex h-screen flex-col overflow-hidden border-r bg-[var(--bg-sidebar)] transition-all duration-200"
      style={{
        width: collapsed ? 60 : 220,
        minWidth: collapsed ? 60 : 220,
        borderColor: "var(--border)",
      }}
    >
      {/* Brand */}
      <div
        className="flex min-h-[62px] items-center justify-between border-b px-4 py-[18px]"
        style={{ borderColor: "var(--border)" }}
      >
        <div className="flex items-center gap-2.5 overflow-hidden">
          <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-[var(--accent)] text-sm font-bold text-white">
            P
          </div>
          {!collapsed && (
            <span className="whitespace-nowrap text-[0.95rem] font-bold tracking-wide text-[var(--text-primary)]">
              PMO Suite
            </span>
          )}
        </div>
        <button
          onClick={() => setCollapsed((c) => !c)}
          title="Colapsar"
          className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md border text-xs text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
          style={{ borderColor: "var(--border)" }}
        >
          {collapsed ? "❯" : "❮"}
        </button>
      </div>

      {/* Section label */}
      {!collapsed && (
        <div className="px-4 pb-1.5 pt-4 text-[0.65rem] uppercase tracking-wider text-[var(--text-disabled)]">
          Dashboards
        </div>
      )}

      {/* Nav list */}
      <ul className="flex-1 overflow-y-auto p-2">
        {navItems.map((item) => {
          const active = pathname === item.href;
          return (
            <li key={item.href} className="mb-0.5">
              <Link
                href={item.href}
                title={item.label}
                className={`flex items-center gap-2.5 overflow-hidden whitespace-nowrap rounded-lg px-2.5 py-2.5 text-sm transition-colors ${
                  active
                    ? "bg-[var(--bg-accent-soft)] text-[var(--accent-light)]"
                    : "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                }`}
              >
                <span
                  className="w-5 flex-shrink-0 text-center text-base"
                  style={{ color: active ? "var(--accent)" : undefined }}
                >
                  {item.icon}
                </span>
                {!collapsed && <span>{item.label}</span>}
              </Link>
            </li>
          );
        })}
      </ul>

      {/* Footer */}
      {!collapsed && (
        <div
          className="border-t px-4 py-3 text-[0.7rem] text-[var(--text-disabled)]"
          style={{ borderColor: "var(--border)" }}
        >
          PMO Dashboard v1.0
        </div>
      )}
    </nav>
  );
}
