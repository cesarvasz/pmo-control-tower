"use client";

// /directorio — Las personas de la app (antes el Directorio RH de Monday): nombre, correo, grupo, rol, TLD, horas al mes,
// activo, campos propios y su liga con el usuario de la app. De aquí salen las columnas Persona de los tableros y los roles
// que usan las métricas (CKU, PM, Sponsor…). Ver: esta página (menú y /roles); cambiar: Admin (directorio_administrar).

import DirectorioTab from "@/features/tableros/ui/DirectorioTab";

export default function DirectorioPage() {
  return (
    <div>
      <h1 className="mb-1 text-lg font-bold text-[var(--text-primary)]">Directorio</h1>
      <p className="mb-4 text-[0.82rem] text-[var(--text-muted)]">Las personas del equipo y sus datos para tableros y métricas.</p>
      <DirectorioTab />
    </div>
  );
}
