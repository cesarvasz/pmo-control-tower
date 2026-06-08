"use client";

import { useEffect, useRef, useState } from "react";

export default function ValorPage() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(600);

  useEffect(() => {
    const sendTheme = () => {
      const t = document.documentElement.getAttribute("data-theme") ?? "dark";
      iframeRef.current?.contentWindow?.postMessage({ type: "pmo-theme", value: t }, "*");
    };
    const onMsg = (e: MessageEvent) => {
      if (e.data?.type === "pmo-height") setHeight(e.data.value);
    };
    const themeObs = new MutationObserver(sendTheme);
    themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    window.addEventListener("message", onMsg);
    return () => {
      themeObs.disconnect();
      window.removeEventListener("message", onMsg);
    };
  }, []);

  return (
    <div className="overflow-hidden rounded-xl border" style={{ borderColor: "var(--border)" }}>
      <iframe
        ref={iframeRef}
        src="/valor/flujo-valor.html"
        title="Ciclo de Vida VALOR"
        className="block w-full"
        scrolling="no"
        style={{ border: 0, background: "var(--bg-base)", height }}
        onLoad={() => {
          const t = document.documentElement.getAttribute("data-theme") ?? "dark";
          iframeRef.current?.contentWindow?.postMessage({ type: "pmo-theme", value: t }, "*");
        }}
      />
    </div>
  );
}
