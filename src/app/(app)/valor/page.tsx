"use client";

import { useEffect, useRef } from "react";

export default function ValorPage() {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const send = () => {
      const t = document.documentElement.getAttribute("data-theme") ?? "dark";
      iframeRef.current?.contentWindow?.postMessage({ type: "pmo-theme", value: t }, "*");
    };
    const observer = new MutationObserver(send);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  return (
    <div className="h-[calc(100dvh-118px)] overflow-hidden rounded-xl border" style={{ borderColor: "var(--border)" }}>
      <iframe
        ref={iframeRef}
        src="/valor/flujo-valor.html"
        title="Ciclo de Vida VALOR"
        className="h-full w-full"
        style={{ border: 0, background: "var(--bg-base)" }}
        onLoad={() => {
          const t = document.documentElement.getAttribute("data-theme") ?? "dark";
          iframeRef.current?.contentWindow?.postMessage({ type: "pmo-theme", value: t }, "*");
        }}
      />
    </div>
  );
}
