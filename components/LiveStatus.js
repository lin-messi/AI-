"use client";

import { useEffect, useState } from "react";
import { useApp } from "./AppProvider";
import { STRINGS } from "@/lib/i18n";
import { timeAgo } from "@/lib/format";

// 展示「最近更新时间」，并轮询 /api/status 检测是否有更新的数据。
// 有新内容时给出刷新提示（数据由云端定时抓取后提交，页面为按请求渲染）。
export default function LiveStatus({ kind = "news", generatedAt }) {
  const { lang } = useApp();
  const t = STRINGS[lang === "en" ? "en" : "zh"];
  const [mounted, setMounted] = useState(false);
  const [hasNew, setHasNew] = useState(false);
  const [, tick] = useState(0);

  // 仅在客户端渲染相对时间，避免 SSR/水合不一致；并每分钟刷新一次。
  useEffect(() => {
    setMounted(true);
    const id = setInterval(() => tick((n) => n + 1), 60000);
    return () => clearInterval(id);
  }, []);

  // 轮询检测是否有更新的数据
  useEffect(() => {
    if (!generatedAt) return;
    let cancelled = false;
    const check = async () => {
      try {
        const r = await fetch("/api/status", { cache: "no-store" });
        if (!r.ok) return;
        const s = await r.json();
        const latest = s?.[kind]?.generatedAt;
        if (!cancelled && latest && new Date(latest) > new Date(generatedAt)) {
          setHasNew(true);
        }
      } catch {
        /* 网络异常忽略，下次再试 */
      }
    };
    const id = setInterval(check, 90000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [kind, generatedAt]);

  if (!mounted || !generatedAt) return null;

  return (
    <div className="live-status">
      <span className="live-dot" aria-hidden />
      <span className="live-text">
        {t.updatedAt}：{timeAgo(generatedAt, lang)}
      </span>
      {hasNew && (
        <button
          className="live-refresh"
          onClick={() => window.location.reload()}
        >
          {t.newContent}
        </button>
      )}
    </div>
  );
}
