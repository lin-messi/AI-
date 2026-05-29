"use client";

import { useApp } from "./AppProvider";
import { STRINGS } from "@/lib/i18n";

export default function Footer() {
  const { lang } = useApp();
  const t = STRINGS[lang === "en" ? "en" : "zh"];
  return (
    <footer className="container site-footer">
      <span>© {new Date().getFullYear()} AI 时事跟踪</span>
      <span>⚠️ {t.footerNote}</span>
    </footer>
  );
}
