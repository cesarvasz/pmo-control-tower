"use client";

// Nota metodológica al pie de la pestaña "Digitalización OCR".

export default function NotaMetodologicaOcr({ tarifaHora }: { tarifaHora: number }) {
  return (
    <section className="mt-8 rounded-xl border p-4 text-[0.74rem] leading-relaxed text-[var(--text-secondary)]"
      style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
      <h3 className="mb-2 text-[0.8rem] font-bold text-[var(--text-primary)]">Cómo se calcula este tablero</h3>
      <ul className="flex flex-col gap-1.5">
        <li>
          <strong>Ventana hábil:</strong> lunes a viernes de 08:00 a 18:00 corrido (sin descontar
          almuerzo), sin sábados ni domingos. Todo intervalo se recorta a esa ventana antes de
          medirse.
        </li>
        <li>
          <strong>T1</strong> = <code>Creación</code> → <code>Digit_docs</code> (digitalización de
          documentos). <strong>T2</strong> = <code>Digit_docs</code> → <code>Digit_carta_licencia</code>
          (digitalización de la carta de licencia). <strong>Total</strong> = T1 + T2.
        </li>
        <li>
          Un file puede tener uno, los dos o ningún hito de digitalización. El promedio, la mediana y
          el P90 de <strong>T2 se calculan solo sobre los files que ya tienen carta de licencia</strong>;
          los demás no cuentan (no se toman como 0). El checkbox <strong>&quot;Solo files
          completos&quot;</strong> restringe todo el tablero a los files con T1 <em>y</em> T2.
        </li>
        <li>
          El selector <strong>Promedio / Mediana</strong> de la tarjeta de tiempo gobierna a la vez
          esos números y las líneas de la evolución en el tiempo.
        </li>
        <li>
          <strong>Rango de fechas:</strong> filtra por <strong>Creación</strong> del file, que es
          también con lo que se agrupa la línea de tiempo.
        </li>
        <li>
          <strong>Casos extremos (&quot;T1 ≤ N h&quot;):</strong> oculta los files cuya digitalización
          de documentos tardó más de N horas hábiles — sirve para ver el comportamiento normal sin los
          pendientes de varios días.
        </li>
        <li>
          <strong>Costo de tiempo (${tarifaHora}/h):</strong> tarifa fija por hora hábil de T1 o de T2.
          A diferencia de los tiempos de arriba (que son promedio o mediana <em>por file</em>), el costo
          es una <strong>suma</strong>: cuánto costó TODO el T1 trabajado en el recorte, más TODO el T2
          trabajado — por eso no cambia con el selector Promedio/Mediana, y por eso el costo de un file
          sin carta de licencia todavía suma su T1. Es independiente del <strong>Costo</strong> de la
          tarjeta de documentos y licencias (ese viene de la hoja, por licencias consumidas).
        </li>
        <li>
          <strong>Costo por file:</strong> junta las dos sumas de arriba — costo de licencias (de la
          hoja) + costo de tiempo (${tarifaHora}/h) — y las reparte entre los files del recorte.
        </li>
        <li>
          <strong>Datos de licencia:</strong> un file &quot;sin datos&quot; es aquel donde Documents
          Count, Pages Count, Licencias y Costo llegan TODOS en 0 — no es que consumió 0 licencias,
          es que la hoja no trae ese dato para ese file. El filtro &quot;Datos de licencia&quot;
          (Todos / Con datos / Sin datos) deja ver cuánto cambia el costo por file según se incluyan
          o no.
        </li>
      </ul>
    </section>
  );
}
