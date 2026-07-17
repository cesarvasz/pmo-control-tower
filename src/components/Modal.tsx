"use client";

import { useEffect, type ReactNode } from "react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  width?: number;
}

export default function Modal({ open, onClose, children, width = 780 }: ModalProps) {
  // Cerrar con Escape + bloquear el scroll del fondo mientras está abierto.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      className="fixed inset-0 z-[9000] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,.65)", backdropFilter: "blur(4px)" }}
    >
      {/* El panel no gestiona su propio scroll: los hijos definen header (shrink-0),
          cuerpo (flex-1 overflow-y-auto) y footer (shrink-0). */}
      <div
        className="flex max-h-[90vh] flex-col overflow-hidden rounded-2xl border shadow-2xl"
        style={{ background: "var(--bg-surface)", borderColor: "var(--border)", width: `min(${width}px, 96vw)` }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
