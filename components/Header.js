"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useApp } from "./AppProvider";
import { STRINGS } from "@/lib/i18n";

export default function Header() {
  const { theme, setTheme, lang, setLang, role, setRole } = useApp();
  const t = STRINGS[lang === "en" ? "en" : "zh"];
  const pathname = usePathname();
  const onPapers = pathname?.startsWith("/papers");
  const onGithub = pathname?.startsWith("/github");
  const onNews = !onPapers && !onGithub;

  return (
    <header className="site-header">
      <div className="container header-inner">
        <div className="brand">
          <div className="brand-logo">AI</div>
          <div>
            <div className="brand-name">AI 时事跟踪</div>
            <div className="brand-sub">{t.brandSub}</div>
          </div>
        </div>

        <nav className="seg nav-tabs" title={t.navNews}>
          <Link className={onNews ? "active" : ""} href="/">
            {t.navNews}
          </Link>
          <Link className={onPapers ? "active" : ""} href="/papers">
            {t.navPapers}
          </Link>
          <Link className={onGithub ? "active" : ""} href="/github">
            {t.navGithub}
          </Link>
        </nav>

        <div className="header-actions">
          {/* 身份切换 */}
          <div className="seg" title={t.role}>
            <button
              className={role === "student" ? "active" : ""}
              onClick={() => setRole("student")}
            >
              {t.roleStudent}
            </button>
            <button
              className={role === "fan" ? "active" : ""}
              onClick={() => setRole("fan")}
            >
              {t.roleFan}
            </button>
            <button
              className={role === "pro" ? "active" : ""}
              onClick={() => setRole("pro")}
            >
              {t.rolePro}
            </button>
          </div>

          {/* 语言切换 zh / en / both */}
          <div className="seg" title={t.lang}>
            <button
              className={lang === "zh" ? "active" : ""}
              onClick={() => setLang("zh")}
            >
              中
            </button>
            <button
              className={lang === "en" ? "active" : ""}
              onClick={() => setLang("en")}
            >
              EN
            </button>
            <button
              className={lang === "both" ? "active" : ""}
              onClick={() => setLang("both")}
            >
              中/EN
            </button>
          </div>

          {/* 主题切换 */}
          <button
            className="btn"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            title={theme === "dark" ? "切换浅色" : "切换深色"}
          >
            {theme === "dark" ? "☀️" : "🌙"}
          </button>
        </div>
      </div>
    </header>
  );
}
