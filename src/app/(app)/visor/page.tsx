"use client";

import { Fragment, useCallback, useRef, useState, type ReactNode } from "react";

// ── Visor de Documentos Aduaneros ────────────────────────────────────────────
// Lee archivos .decdat / .dva / .json / .xml (o cualquier texto) y los muestra
// en una vista legible (carátula, ítems, facturas…), una vista de código y
// ambas. Todo adaptado a las variables de tema de la app.

type Mode = "formatted" | "code" | "dual";
type FileType = "json" | "xml";

type JsonObj = Record<string, unknown>;
const asObj = (v: unknown): JsonObj => (v && typeof v === "object" && !Array.isArray(v) ? (v as JsonObj) : {});
const asArr = (v: unknown): JsonObj[] => (Array.isArray(v) ? (v as JsonObj[]) : []);
const str = (v: unknown): string => (v === null || v === undefined || v === "" ? "—" : String(v));
const oneLine = (v: unknown): string => String(v ?? "").replace(/\s*\n\s*/g, " ").trim();

export default function VisorPage() {
  const [rawText, setRawText] = useState("");
  const [data, setData] = useState<JsonObj | Document | null>(null);
  const [fileType, setFileType] = useState<FileType>("json");
  const [fileName, setFileName] = useState("");
  const [fileExt, setFileExt] = useState("");
  const [mode, setMode] = useState<Mode>("formatted");
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const formattedRef = useRef<HTMLDivElement>(null);

  const loadFile = useCallback((file: File) => {
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = String(e.target?.result ?? "");
      setError("");
      const isXml = text.trimStart().startsWith("<");
      setFileName(file.name);
      setFileExt(ext);
      setRawText(text);
      if (isXml) {
        const doc = new DOMParser().parseFromString(text, "text/xml");
        const err = doc.querySelector("parsererror");
        if (err) {
          setError("XML inválido: " + (err.textContent ?? "").slice(0, 200));
          return;
        }
        setFileType("xml");
        setData(doc);
      } else {
        try {
          setFileType("json");
          setData(JSON.parse(text) as JsonObj);
        } catch (err) {
          setError("No se pudo parsear: " + (err instanceof Error ? err.message : String(err)));
          return;
        }
      }
      setMode("formatted");
    };
    reader.readAsText(file);
  }, []);

  const reset = () => {
    setData(null);
    setRawText("");
    setFileName("");
    setError("");
    if (inputRef.current) inputRef.current.value = "";
  };

  const printDoc = () => {
    const node = formattedRef.current;
    if (!node) return;
    const w = window.open("", "_blank", "width=920,height=720");
    if (!w) return;
    // Clona solo hojas de estilo (Tailwind + variables de tema), forzando tema claro.
    const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
      .map((el) => el.outerHTML)
      .join("");
    w.document.open();
    w.document.write(
      `<!DOCTYPE html><html data-theme="light"><head><meta charset="UTF-8"/>` +
        `<base href="${location.origin}/"/>${styles}` +
        `<style>` +
        `*{-webkit-print-color-adjust:exact;print-color-adjust:exact}` +
        `body{background:#fff!important;padding:18px;color:#1e2130}` +
        `.card-body{display:block!important}` +
        `@page{margin:1cm}</style></head>` +
        `<body>${node.innerHTML}</body></html>`,
    );
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 500);
  };

  return (
    <div>
      {/* Encabezado */}
      <div className="mb-5">
        <h1 className="text-xl font-bold text-[var(--text-primary)]">🛃 Visor</h1>
        <p className="mt-0.5 text-sm text-[var(--text-muted)]">
          Abre archivos <code>.decdat</code> · <code>.dva</code> · <code>.json</code> · <code>.xml</code> · o cualquier texto
        </p>
      </div>

      {error && (
        <div
          className="mb-4 rounded-lg border px-4 py-3 text-sm"
          style={{ background: "var(--pill-atrasado-bg)", borderColor: "var(--pill-atrasado-br)", color: "var(--pill-atrasado-fg)" }}
        >
          {error}
        </div>
      )}

      {!data ? (
        /* ── Zona de carga ── */
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]); }}
          className="mx-auto flex min-h-[300px] w-full max-w-2xl cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 text-center transition-colors"
          style={{
            background: dragOver ? "var(--bg-hover)" : "var(--bg-surface)",
            borderColor: dragOver ? "var(--accent)" : "var(--border-subtle)",
          }}
        >
          <div className="mb-3 text-5xl">📁</div>
          <p className="mb-1 text-base font-medium text-[var(--accent-light)]">Arrastra tu archivo aquí</p>
          <p className="text-xs text-[var(--text-muted)]">o haz clic para seleccionarlo</p>
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            onChange={(e) => { if (e.target.files?.[0]) loadFile(e.target.files[0]); }}
          />
        </div>
      ) : (
        <>
          {/* ── Controles ── */}
          <div className="mb-5 flex flex-wrap items-center gap-2">
            <span className="mr-1 flex items-center gap-2 truncate text-sm font-semibold text-[var(--text-primary)]">
              📦 {fileName}
              <span
                className="rounded-md px-2 py-0.5 text-[0.65rem] font-bold uppercase"
                style={{ background: "var(--bg-accent-soft)", color: "var(--accent-light)" }}
              >
                {fileExt || "file"}
              </span>
            </span>
            <div className="flex-1" />
            <ViewBtn active={mode === "formatted"} onClick={() => setMode("formatted")}>Vista legible</ViewBtn>
            <ViewBtn active={mode === "code"} onClick={() => setMode("code")}>Ver código</ViewBtn>
            <ViewBtn active={mode === "dual"} onClick={() => setMode("dual")}>Ambas</ViewBtn>
            <button
              onClick={printDoc}
              className="rounded-lg px-3 py-1.5 text-[0.78rem] font-semibold text-white transition-colors"
              style={{ background: "var(--accent)" }}
            >
              ↓ PDF
            </button>
            <button
              onClick={reset}
              className="rounded-lg border px-3 py-1.5 text-[0.78rem] font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)]"
              style={{ borderColor: "var(--border)" }}
            >
              ⬅ Abrir otro
            </button>
          </div>

          {/* ── Vistas ── */}
          <div className={mode === "dual" ? "grid gap-4 lg:grid-cols-2" : ""}>
            {mode !== "code" && (
              <div ref={formattedRef} className="space-y-4">
                {fileType === "xml"
                  ? <XmlTree doc={data as Document} />
                  : <Formatted data={data as JsonObj} />}
              </div>
            )}
            {mode !== "formatted" && (
              <CodeView fileType={fileType} rawText={rawText} data={fileType === "json" ? (data as JsonObj) : null} />
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ── Controles ────────────────────────────────────────────────────────────────
function ViewBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="rounded-lg px-3 py-1.5 text-[0.78rem] font-semibold transition-colors"
      style={
        active
          ? { background: "var(--accent)", color: "#fff" }
          : { background: "var(--bg-hover)", color: "var(--text-secondary)" }
      }
    >
      {children}
    </button>
  );
}

// ── Bloques reutilizables ────────────────────────────────────────────────────
function Card({ title, children, defaultOpen = true }: { title: ReactNode; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="overflow-hidden rounded-xl border" style={{ borderColor: "var(--border)" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left text-[0.85rem] font-semibold transition-colors hover:brightness-110"
        style={{ background: "var(--bg-hover)", color: "var(--text-primary)" }}
      >
        <span>{title}</span>
        <span className="text-[0.7rem] text-[var(--text-muted)]">{open ? "▾" : "▸"}</span>
      </button>
      <div className={`card-body px-4 py-3 ${open ? "" : "hidden"}`}>{children}</div>
    </div>
  );
}

function KV({ rows }: { rows: [string, unknown][] }) {
  return (
    <div className="grid items-start gap-x-4 gap-y-1.5" style={{ gridTemplateColumns: "minmax(130px,190px) 1fr" }}>
      {rows.map(([label, val], i) => (
        <Fragment key={i}>
          <div className="text-right text-[0.76rem] text-[var(--text-muted)]">{label}</div>
          <div className="text-[0.84rem] font-semibold break-words text-[var(--text-primary)]">{str(val)}</div>
        </Fragment>
      ))}
    </div>
  );
}

function SummaryBox({ title, items }: { title: string; items: [string, string][] }) {
  return (
    <div className="rounded-xl px-5 py-4 text-white" style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-hover))" }}>
      <h3 className="mb-3 border-b border-white/25 pb-2 text-[0.95rem] font-bold">{title}</h3>
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))" }}>
        {items.map(([label, val], i) => (
          <div key={i} className="text-center">
            <div className="text-[0.68rem] uppercase tracking-wide opacity-80">{label}</div>
            <div className="text-[1.05rem] font-bold leading-tight">{val}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DataTable({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="table-wrap">
      <table className="pmo">
        <thead>
          <tr>{head.map((h, i) => <th key={i}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Vista legible (JSON) ─────────────────────────────────────────────────────
function Formatted({ data }: { data: JsonObj }) {
  const dec = asObj(data.declaracion);
  if (!data.declaracion) {
    return <GenericJson data={data} />;
  }
  if (dec.caratula) return <Decdat dec={dec} />;
  if (dec.importador) return <Dva dec={dec} />;
  return <GenericJson data={data} />;
}

function GenericJson({ data }: { data: JsonObj }) {
  return (
    <Card title="Contenido">
      <pre className="overflow-x-auto rounded-lg p-3 text-[0.78rem] leading-relaxed" style={{ background: "var(--code-bg)", color: "var(--text-secondary)" }}>
        {JSON.stringify(data, null, 2)}
      </pre>
    </Card>
  );
}

// DECDAT — declaración aduanera
function Decdat({ dec }: { dec: JsonObj }) {
  const c = asObj(dec.caratula);
  const docs = asArr(dec.documentos);
  const items = asArr(dec.items);
  const bultos = asObj(dec.bultos);

  return (
    <>
      <SummaryBox
        title={`📋 ${str(c.nroPreimpreso === "" ? "Declaración" : c.nroPreimpreso)}`}
        items={[
          ["Régimen", str(c.regimen)],
          ["Aduana", str(c.aduana)],
          ["Factura", `${str(c.divisaFactura ?? "USD")} ${str(c.totalFactura)}`],
          ["Flete", str(c.totalFlete)],
          ["Seguro", str(c.totalSeguro)],
          ["Peso Bruto", `${str(c.pesoBruto)} kg`],
          ["Bultos", str(c.cantidadBultos)],
          ["Ítems", str(c.canItems)],
        ]}
      />

      <Card title="📋 Carátula">
        <KV
          rows={[
            ["Índice", c.nroPreimpreso],
            ["Régimen", c.regimen],
            ["Aduana", c.aduana],
            ["RUC", c.rucImpoExpo],
            ["Cond. Entrega", c.condicionEntrega],
            ["País Origen", c.paisOrigen],
            ["Divisa", c.divisaFactura],
            ["Total Factura", c.totalFactura],
            ["Cotización", c.cotDivFactura],
            ["Flete", c.totalFlete],
            ["Seguro", c.totalSeguro],
            ["Peso Bruto (kg)", c.pesoBruto],
            ["Bultos", c.cantidadBultos],
            ["Ítems", c.canItems],
            ["Forma Pago", c.formaPagoFac],
            ["Proveedor", c.nomDestProv],
          ]}
        />
      </Card>

      {docs.length > 0 && (
        <Card title="📄 Documentos">
          <DataTable
            head={["Código", "Descripción", "Referencia", "Pres."]}
            rows={docs.map((d) => [str(d.codDocumento), str(d.descripcion), str(d.referencia), str(d.presencia)])}
          />
        </Card>
      )}

      {items.length > 0 && (
        <Card title="📦 Ítems">
          <DataTable
            head={["#", "Descripción", "PA", "Orig", "Est.", "Cant", "FOB", "Flete", "Seg.", "P.Neto", "P.Bruto"]}
            rows={items.map((i) => [
              str(i.nroItem),
              str(i.descripcion),
              <span key="pa" className="font-mono text-[0.75rem]">{str(i.posArancelaria)}</span>,
              str(i.paisOrigen),
              str(i.estadoMercancia),
              str(i.cantComercial),
              `$${str(i.importeFOB)}`,
              `$${str(i.importeFlete)}`,
              `$${str(i.importeSeguro)}`,
              `${str(i.pesoNeto)} kg`,
              `${str(i.pesoBruto)} kg`,
            ])}
          />
        </Card>
      )}

      {dec.bultos != null && (
        <Card title="🚢 Bultos">
          <KV rows={[["Manifiesto", bultos.manifiesto], ["Título Transporte", bultos.tituloTransporte]]} />
        </Card>
      )}
    </>
  );
}

// DVA — declaración del valor en aduana
function Dva({ dec }: { dec: JsonObj }) {
  const imp = asObj(dec.importador);
  const prov = asObj(dec.proveedor);
  const det = asObj(dec.determinacion);
  const ada = asObj(dec.aduana);
  const tx = asObj(dec.transaccion);
  const facturas = asArr(dec.facturas);

  return (
    <>
      <SummaryBox
        title={`DVA — ${str(imp.nomImportador)}`}
        items={[
          ["Aduana Ingreso", str(ada.idAduanaIngreso)],
          ["Fecha Aceptación", str(ada.fechaAceptDecla)],
          ["Importe Factura", `USD ${str(det.importeFactura)}`],
          ["Valor Aduana", `USD ${str(det.valorAduana)}`],
          ["Transporte", `USD ${str(det.importeTransporte ?? "0")}`],
          ["Seguro", `USD ${str(det.importeSeguro ?? "0")}`],
        ]}
      />

      <Card title="🏢 Importador">
        <KV
          rows={[
            ["Nombre", imp.nomImportador],
            ["RTN", imp.rtnImportador],
            ["Dirección", imp.dirImportador],
            ["Ciudad", imp.ciuImportador],
            ["País", imp.paisImportador],
            ["Teléfono", imp.telImportador],
            ["Email", imp.emailImportador],
          ]}
        />
      </Card>

      <Card title="🏭 Proveedor">
        <KV
          rows={[
            ["Nombre", prov.nombre],
            ["Dirección", prov.direccion],
            ["Ciudad", prov.ciudad],
            ["País", prov.pais],
            ["Teléfono", prov.telefono],
            ["Email", prov.email],
            ["Cond. Comercial", prov.condComercial],
          ]}
        />
      </Card>

      <Card title="🔁 Transacción">
        <KV
          rows={[
            ["Lugar Entrega", tx.lugarEntrega],
            ["Cond. Entrega", tx.condicionEntrega],
            ["Forma Envío", tx.formaEnvio],
            ["Forma Pago", tx.formaPago],
            ["País Embarque", tx.paisEmbarque],
            ["Fecha Exportación", tx.fechaExportacion],
            ["Moneda", tx.monedaTransaccion],
            ["Tipo Cambio", tx.tipoCambioMonedaDec],
          ]}
        />
      </Card>

      <Card title="💰 Determinación del Valor">
        <KV
          rows={[
            ["Importe Factura", det.importeFactura],
            ["Importe Real Pagado", det.importeRealPagado],
            ["Transporte", det.importeTransporte],
            ["Seguro", det.importeSeguro],
            ["Total Ajustes", det.importeAjustes],
            ["Valor Aduana", det.valorAduana],
          ]}
        />
      </Card>

      {facturas.map((fac, fi) => {
        const info = asObj(fac.informacion);
        const items = asArr(fac.items);
        return (
          <Card key={fi} title={`🧾 Factura ${fi + 1}: ${str(info.nroFactura)}`}>
            <KV rows={[["N° Factura", info.nroFactura], ["Fecha", info.fecha]]} />
            {items.length > 0 && (
              <div className="mt-3">
                <DataTable
                  head={["#", "Descripción", "Marca", "Modelo", "PA", "Orig", "Cant", "P.Unit", "FOB Total"]}
                  rows={items.map((i) => [
                    str(i.nroItem),
                    oneLine(i.designacionComercial) || "—",
                    str(i.marcaMercancias),
                    str(i.modeloMercancias),
                    <span key="pa" className="font-mono text-[0.75rem]">{str(i.posArancelaria)}</span>,
                    str(i.paisOriMercancias),
                    `${str(i.cantComercial)} ${str(i.uniComercial)}`,
                    `$${str(i.precioUnitario)}`,
                    `$${str(i.totalFobUnitario)}`,
                  ])}
                />
              </div>
            )}
          </Card>
        );
      })}
    </>
  );
}

// ── Árbol XML ────────────────────────────────────────────────────────────────
function XmlTree({ doc }: { doc: Document }) {
  const roots = Array.from(doc.childNodes).filter((n): n is Element => n.nodeType === 1);
  return (
    <Card title="🌳 Estructura XML">
      <div className="overflow-x-auto">
        {roots.map((n, i) => <XmlNode key={i} node={n} depth={0} />)}
      </div>
    </Card>
  );
}

function XmlNode({ node, depth }: { node: Element; depth: number }) {
  const [open, setOpen] = useState(depth < 3);
  const children = Array.from(node.children);
  const attrs = Array.from(node.attributes);
  const hasChildren = children.length > 0;
  const text = !hasChildren ? (node.textContent ?? "").trim() : "";

  return (
    <div className="ml-3">
      <div
        className="flex flex-wrap items-center gap-1.5 rounded px-1.5 py-0.5 font-mono text-[0.8rem] hover:bg-[var(--bg-hover)]"
        style={{ cursor: hasChildren ? "pointer" : "default" }}
        onClick={() => hasChildren && setOpen((o) => !o)}
      >
        <span className="w-3 flex-shrink-0 text-[0.6rem] text-[var(--text-muted)]">{hasChildren ? (open ? "▾" : "▸") : ""}</span>
        <span style={{ color: "var(--accent)", fontWeight: 600 }}>&lt;{node.tagName}&gt;</span>
        {attrs.map((a) => (
          <span key={a.name} style={{ color: "var(--text-secondary)" }}>
            {a.name}=<span style={{ color: "#c8820a" }}>&quot;{a.value}&quot;</span>
          </span>
        ))}
        {text && <span className="text-[var(--text-primary)]">{text}</span>}
      </div>
      {hasChildren && open && (
        <div className="border-l" style={{ borderColor: "var(--border)" }}>
          {children.map((c, i) => <XmlNode key={i} node={c} depth={depth + 1} />)}
        </div>
      )}
    </div>
  );
}

// ── Vista de código ──────────────────────────────────────────────────────────
function CodeView({ fileType, rawText, data }: { fileType: FileType; rawText: string; data: JsonObj | null }) {
  const content =
    fileType === "json" && data
      ? highlightJson(JSON.stringify(data, null, 2))
      : rawText;
  return (
    <pre
      className="overflow-x-auto rounded-xl p-4 text-[0.78rem] leading-relaxed"
      style={{ background: "var(--code-bg)", border: "1px solid var(--code-border)", color: "var(--text-secondary)", whiteSpace: "pre-wrap", wordBreak: "break-word" }}
    >
      {content}
    </pre>
  );
}

// Resalta JSON devolviendo nodos React (seguro: React escapa el texto).
function highlightJson(json: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const re = /("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(?:\s*:)?|\b(?:true|false|null)\b|-?\d+\.?\d*(?:[eE][+-]?\d+)?)/g;
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(json)) !== null) {
    if (m.index > last) nodes.push(json.slice(last, m.index));
    const tok = m[0];
    let color = "#fab387"; // número
    if (/^"/.test(tok)) color = /:\s*$/.test(tok) ? "#89b4fa" : "#a6e3a1"; // clave / string
    else if (/^(?:true|false)$/.test(tok)) color = "#f38ba8";
    else if (tok === "null") color = "#9399b2";
    nodes.push(<span key={key++} style={{ color }}>{tok}</span>);
    last = re.lastIndex;
  }
  if (last < json.length) nodes.push(json.slice(last));
  return nodes;
}
