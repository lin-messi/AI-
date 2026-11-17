"use client";

import { createContext, useContext, useEffect, useState } from "react";

// 全局状态：主题 / 语言 / 身份 / 收藏 / 已读
const AppContext = createContext(null);

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}

function loadSet(key) {
  if (typeof window === "undefined") return new Set();
  try {
    return new Set(JSON.parse(localStorage.getItem(key) || "[]"));
  } catch {
    return new Set();
  }
}

export default function AppProvider({ children }) {
  const [theme, setTheme] = useState("dark");
  const [lang, setLang] = useState("zh"); // zh | en | both
  const [role, setRole] = useState("student");
  const [{ favs, favoritePaperMeta }, setFavorites] = useState({ favs: new Set(), favoritePaperMeta: {} });
  const [reads, setReads] = useState(new Set());
  const [ready, setReady] = useState(false);

  // 初始化：从 localStorage 读取
  useEffect(() => {
    const t = localStorage.getItem("theme") || "dark";
    const l = localStorage.getItem("lang") || "zh";
    const r = localStorage.getItem("role") || "student";
    setTheme(t);
    setLang(l);
    setRole(r);
    let paperMeta = {};
    try {
      const stored = JSON.parse(localStorage.getItem("favoritePaperMeta") || "{}");
      if (stored && typeof stored === "object" && !Array.isArray(stored)) paperMeta = stored;
    } catch {}
    setFavorites({ favs: loadSet("favs"), favoritePaperMeta: paperMeta });
    setReads(loadSet("reads"));
    setReady(true);
  }, []);

  // 主题写入 <html data-theme>
  useEffect(() => {
    if (!ready) return;
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme, ready]);

  useEffect(() => {
    if (ready) localStorage.setItem("lang", lang);
  }, [lang, ready]);

  useEffect(() => {
    if (ready) localStorage.setItem("role", role);
  }, [role, ready]);

  useEffect(() => {
    if (!ready) return;
    localStorage.setItem("favs", JSON.stringify([...favs]));
    localStorage.setItem("favoritePaperMeta", JSON.stringify(favoritePaperMeta));
  }, [favs, favoritePaperMeta, ready]);

  const toggleFav = (id, paper) => {
    setFavorites((previous) => {
      const next = new Set(previous.favs);
      const meta = { ...previous.favoritePaperMeta };
      if (next.has(id)) {
        next.delete(id);
        delete meta[id];
      } else {
        next.add(id);
        if (paper?.title_en || paper?.title_zh) {
          meta[id] = { title_zh: paper.title_zh || "", title_en: paper.title_en || "", url: paper.url || "" };
        }
      }
      return { favs: next, favoritePaperMeta: meta };
    });
  };

  const toggleRead = (id) => {
    setReads((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      localStorage.setItem("reads", JSON.stringify([...next]));
      return next;
    });
  };

  const value = {
    ready,
    theme,
    setTheme,
    lang,
    setLang,
    role,
    setRole,
    favs,
    favoritePaperMeta,
    reads,
    toggleFav,
    toggleRead,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
