"use client";

import { useEffect, useRef } from "react";

export default function ValorPage() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let styleEl: HTMLStyleElement | null = null;
    const scriptEls: HTMLScriptElement[] = [];
    let mounted = true;

    fetch("/valor/flujo-valor.html")
      .then((r) => r.text())
      .then((html) => {
        if (!mounted || !rootRef.current) return;

        // Scope the two problematic global selectors; all class/id selectors
        // are VALOR-specific and don't conflict with the app.
        const cssText = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)]
          .map((m) => m[1])
          .join("\n")
          .replace(/^(\s*)\*(\s*\{)/gm, "$1.valor-root *$2")
          .replace(/^(\s*)body(\s*\{)/gm, "$1.valor-root$2")
          .replace(/body\[data-theme/g, ".valor-root[data-theme");

        styleEl = document.createElement("style");
        styleEl.textContent = cssText;
        document.head.appendChild(styleEl);

        // Extract body content, pull out <script> tags to run separately
        // (innerHTML does not execute scripts).
        const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/);
        if (!bodyMatch) return;

        const scripts: string[] = [];
        const bodyHtml = bodyMatch[1].replace(
          /<script[^>]*>([\s\S]*?)<\/script>/gi,
          (_, code) => { scripts.push(code); return ""; }
        );

        rootRef.current.innerHTML = bodyHtml;

        scripts.forEach((code) => {
          const s = document.createElement("script");
          // Wrap in IIFE so const/let/var declarations don't leak into the
          // global scope — prevents "already declared" errors on remount.
          s.textContent = `(function(){\n${code}\n})();`;
          document.head.appendChild(s);
          scriptEls.push(s);
        });

        // Apply current theme immediately after content is in the DOM
        const t = document.documentElement.getAttribute("data-theme") ?? "dark";
        rootRef.current.setAttribute("data-theme", t);
      });

    // Keep theme attribute in sync with the app
    const themeObs = new MutationObserver(() => {
      if (!rootRef.current) return;
      const t = document.documentElement.getAttribute("data-theme") ?? "dark";
      rootRef.current.setAttribute("data-theme", t);
    });
    themeObs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    return () => {
      mounted = false;
      themeObs.disconnect();
      styleEl?.remove();
      scriptEls.forEach((s) => s.remove());
    };
  }, []);

  return (
    <div
      ref={rootRef}
      className="valor-root rounded-xl border"
      style={{ borderColor: "var(--border)", minHeight: 400 }}
    />
  );
}
