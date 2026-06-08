"use client";

// Diagrama de flujo del Ciclo de Vida VALOR.
// El contenido es un documento HTML autocontenido (con su propio diseño,
// calculadora ROI/Payback y branding C807) que vive en /public/valor/.
// Se embebe en un iframe para aislar su CSS global del resto de la app;
// el login original quedó neutralizado porque la app ya autentica.
export default function ValorPage() {
  return (
    <div className="h-[calc(100dvh-118px)] overflow-hidden rounded-xl border" style={{ borderColor: "var(--border)" }}>
      <iframe
        src="/valor/flujo-valor.html"
        title="Ciclo de Vida VALOR"
        className="h-full w-full"
        style={{ border: 0, background: "#f4f6f9" }}
      />
    </div>
  );
}
