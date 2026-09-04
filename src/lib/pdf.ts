// src/lib/pdf.ts
// Genera un PDF real (descarga directa) a partir de un nodo del DOM construido
// específicamente para ese tamaño — no es un window.print() de la página: no
// depende del diálogo de impresión del navegador ni de su paginación (que no
// se podía verificar visualmente). html2canvas + jsPDF son librerías de
// cliente puras, se cargan con import() dinámico para no engordar el bundle
// de páginas que nunca generan un PDF.
export async function downloadElementAsPdf(el: HTMLElement, filename: string): Promise<void> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);
  const canvas = await html2canvas(el, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
  const img = canvas.toDataURL("image/png");

  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  // El nodo ya está dimensionado a la proporción de una hoja A4 (ver
  // ProjectPdfReport), así que esto normalmente llena la página completa;
  // el cálculo de proporción queda como salvaguarda si algún día cambia.
  const ratio = Math.min(pageW / canvas.width, pageH / canvas.height);
  const w = canvas.width * ratio;
  const h = canvas.height * ratio;
  pdf.addImage(img, "PNG", (pageW - w) / 2, (pageH - h) / 2, w, h);
  pdf.save(filename);
}
