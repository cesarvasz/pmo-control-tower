"use client";

import { useEffect, type ReactNode } from "react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  width?: number;
}

export default function Modal({ open, onClose, children, width = 780 }: ModalProps) {
  // Cerrar con Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      className="fixed inset-0 z-[9000] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,.65)", backdropFilter: "blur(4px)" }}
    >
      <div
        className="flex max-h-[90vh] flex-col overflow-y-auto rounded-2xl border shadow-2xl"
        style={{ background: "var(--bg-surface)", borderColor: "var(--border)", width: `min(${width}px, 96vw)` }}
      >
        {children}
      </div>
    </div>
  );
}
