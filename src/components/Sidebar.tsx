"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import { useMe } from "@/context/PermissionsContext";
import { useGroups } from "@/context/GroupsContext";
import { buildNav, type NavLeaf } from "@/lib/registry";

interface SidebarProps {
  mobileOpen?: boolean;
  onClose?: () => void;
}

export default function Sidebar({ mobileOpen = false, onClose }: SidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const { me } = useMe();
  const { groups } = useGroups();

  const nodes = useMemo(() => buildNav(me?.permissions, groups), [me?.permissions, groups]);

  // undefined = never toggled, true = open, false = closed.
  // Always starts closed (undefined → false); user toggle always wins.
  const [openGroups, setOpenGroups] = useState<Record<string, boolean | undefined>>({});

  const isActive = (href: string) => pathname === href;

  const renderLeaf = (item: NavLeaf, indented = false) => {
    const active = isActive(item.href);
    return (
      <li key={item.href} className="mb-0.5">
        <Link
          href={item.href}
          onClick={onClose}
          title={item.label}
          className={`flex items-center gap-2.5 overflow-hidden whitespace-nowrap rounded-lg py-2.5 text-sm transition-colors ${
            indented && !collapsed ? "pl-9 pr-2.5" : "px-2.5"
          } ${
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
  };

  return (
    <>
      {/* Backdrop para cerrar en móvil al tocar fuera */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-[199] bg-black/50 md:hidden"
          onClick={onClose}
        />
      )}

      <nav
        className={[
          // Base: overlay fijo en móvil, desliza con transform
          "fixed inset-y-0 left-0 z-[200] flex h-screen flex-col overflow-hidden border-r bg-[var(--bg-sidebar)]",
          "transition-transform duration-200 ease-in-out",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
          // Desktop (md+): pegajoso en flujo, sin transform, ancho variable
          "md:sticky md:top-0 md:z-[100] md:translate-x-0 md:transition-[width] md:duration-200",
          // Ancho: móvil siempre 260px; escritorio sigue estado collapsed
          "w-[260px] min-w-[260px]",
          collapsed ? "md:w-[60px] md:min-w-[60px]" : "md:w-[220px] md:min-w-[220px]",
        ].join(" ")}
        style={{ borderColor: "var(--border)" }}
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
          {/* Escritorio: colapsar/expandir */}
          <button
            onClick={() => setCollapsed((c) => !c)}
            title="Colapsar"
            className="hidden h-6 w-6 flex-shrink-0 items-center justify-center rounded-md border text-xs text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)] md:flex"
            style={{ borderColor: "var(--border)" }}
          >
            {collapsed ? "❯" : "❮"}
          </button>
          {/* Móvil: cerrar */}
          <button
            onClick={onClose}
            title="Cerrar"
            className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md border text-xs text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)] md:hidden"
            style={{ borderColor: "var(--border)" }}
          >
            ✕
          </button>
        </div>

        {/* Section label */}
        {!collapsed && (
          <div className="px-4 pb-1.5 pt-4 text-[0.65rem] uppercase tracking-wider text-[var(--text-disabled)]">
            Navegación
          </div>
        )}

        {/* Nav list */}
        <ul className="flex-1 overflow-y-auto p-2">
          {nodes.map((node) => {
            if (node.type === "item") return renderLeaf(node.item);

            const manualState = openGroups[node.key];
            const open = manualState ?? false;
            const childActive = node.items.some((i) => isActive(i.href));

            return (
              <li key={node.key} className="mb-0.5">
                <button
                  onClick={() => setOpenGroups((s) => ({ ...s, [node.key]: !open }))}
                  title={node.label}
                  className={`flex w-full items-center gap-2.5 overflow-hidden whitespace-nowrap rounded-lg px-2.5 py-2.5 text-sm transition-colors ${
                    childActive
                      ? "text-[var(--accent-light)]"
                      : "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  <span
                    className="w-5 flex-shrink-0 text-center text-base"
                    style={{ color: childActive ? "var(--accent)" : undefined }}
                  >
                    {node.icon}
                  </span>
                  {!collapsed && (
                    <>
                      <span className="flex-1 text-left">{node.label}</span>
                      <span className="flex-shrink-0 text-[0.6rem] text-[var(--text-muted)]">
                        {open ? "▾" : "▸"}
                      </span>
                    </>
                  )}
                </button>
                {open && <ul className="mt-0.5">{node.items.map((item) => renderLeaf(item, true))}</ul>}
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
    </>
  );
}
