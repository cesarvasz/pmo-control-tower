"use client";

// Nota metodológica al pie de la pestaña "Digitalización OCR".

export default function NotaMetodologicaOcr() {
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
          esos números y las líneas de la evolución en el tiempo. P90 y máximo se muestran siempre
          como referencia.
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
      </ul>
    </section>
  );
}
