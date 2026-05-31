"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useApp } from "./AppProvider";
import { formatDateLong } from "@/lib/format";

// homeHref / archivePrefix 可选，默认用于新闻；论文页传入 "/papers" 即可复用
export default function DateNav({
  date,
  dates,
  latest,
  homeHref = "/",
  archivePrefix = "/archive",
}) {
  const { lang } = useApp();
  const router = useRouter();
  const idx = dates.indexOf(date);
  // dates 为降序（新→旧）：newer = idx-1, older = idx+1
  const newer = idx > 0 ? dates[idx - 1] : null;
  const older = idx >= 0 && idx < dates.length - 1 ? dates[idx + 1] : null;

  const hrefFor = (d) => (d === latest ? homeHref : `${archivePrefix}/${d}`);

  const onSelect = (e) => {
    const d = e.target.value;
    router.push(hrefFor(d));
  };

  if (!dates.length) return null;

  return (
    <div className="datenav">
      <Link
        className={`btn ${older ? "" : "disabled"}`}
        href={older ? hrefFor(older) : "#"}
        aria-disabled={!older}
      >
        ← {lang === "en" ? "Older" : "更早"}
      </Link>

      <select className="date-select" value={date} onChange={onSelect}>
        {dates.map((d) => (
          <option key={d} value={d}>
            {formatDateLong(d, lang)}
            {d === latest ? (lang === "en" ? " · Latest" : " · 最新") : ""}
          </option>
        ))}
      </select>

      <Link
        className={`btn ${newer ? "" : "disabled"}`}
        href={newer ? hrefFor(newer) : "#"}
        aria-disabled={!newer}
      >
        {lang === "en" ? "Newer" : "更新"} →
      </Link>
    </div>
  );
}
