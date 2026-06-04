"use client";

import { useEffect, useState } from "react";
import { useApp } from "./AppProvider";
import { STRINGS } from "@/lib/i18n";
import { downloadItem } from "@/lib/paperDownload";

// 站内精读弹层：展示中文精读 / 摘要，并可在站内打开 PDF。
// 若该论文未预翻译，则按需调用 /api/translate 生成精读。
export default function PaperReader({ paper, onClose }) {
  const { lang } = useApp();
  const t = STRINGS[lang === "en" ? "en" : "zh"];
  const [data, setData] = useState(paper);
  const [loading, setLoading] = useState(false);
  const [showPdf, setShowPdf] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const onDownload = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      await downloadItem(data, { type: "paper" });
    } catch (e) {
      alert((lang === "en" ? "Download failed: " : "下载失败：") + e.message);
    } finally {
      setDownloading(false);
    }
  };

  // 锁定背景滚动
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  // 缺少中文精读时按需翻译
  useEffect(() => {
    if (paper.digest_zh || loading) return;
    let cancelled = false;
    setLoading(true);
    fetch("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: paper.title_en,
        abstract: paper.abstract_en,
      }),
    })
      .then((r) => r.json())
      .then((res) => {
        if (cancelled || res.error) return;
        setData((d) => ({
          ...d,
          title_zh: d.title_zh || res.title_zh,
          abstract_zh: d.abstract_zh || res.abstract_zh,
          highlight_zh: d.highlight_zh || res.highlight_zh,
          digest_zh: res.digest_zh,
        }));
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const title = data.title_zh || data.title_en;
  const titleAlt =
    data.title_zh && data.title_en && data.title_zh !== data.title_en
      ? data.title_en
      : null;
  const pdfProxy = data.pdf_url
    ? `/api/paper-pdf?url=${encodeURIComponent(data.pdf_url)}`
    : "";

  const rmValue = data.rm?.value;
  const rmValueLabel =
    rmValue === "high" ? t.roboUsageHigh : rmValue === "low" ? t.roboUsageLow : t.roboUsageMid;

  return (
    <div className="reader-mask" onClick={onClose}>
      <div className="reader" onClick={(e) => e.stopPropagation()}>
        <div className="reader-head">
          <h2>
            {title}
            {titleAlt && <span className="alt">{titleAlt}</span>}
          </h2>
          <button className="reader-close" onClick={onClose}>
            {t.close}
          </button>
        </div>

        {data.authors?.length > 0 && (
          <div className="paper-authors" style={{ whiteSpace: "normal" }}>
            {t.paperAuthors}：{data.authors.join(", ")}
          </div>
        )}

        {data.highlight_zh && (
          <div className="why" style={{ marginTop: 12 }}>
            <b>{t.highlight}：</b>
            {data.highlight_zh}
          </div>
        )}

        {data.rm?.usage && (
          <div className="rm-usage">
            <div className="rm-usage-head">
              <span className="rm-usage-title">{t.roboUsage}</span>
              {rmValue && (
                <span className={`usage-badge ${rmValue}`}>{rmValueLabel}</span>
              )}
              {data.rm.task && (
                <span className="task-chip">
                  {t.roboUsageTask}：{data.rm.task}
                </span>
              )}
            </div>
            <p className="rm-usage-text">{data.rm.usage}</p>
          </div>
        )}

        <div className="reader-sec">
          <h4>{t.digest}</h4>
          <p>
            {data.digest_zh ||
              (loading ? t.translating : data.abstract_zh || data.abstract_en)}
          </p>
        </div>

        {(data.abstract_zh || data.abstract_en) && (
          <div className="reader-sec">
            <h4>{t.abstract}</h4>
            <p>{data.abstract_zh || data.abstract_en}</p>
          </div>
        )}

        {pdfProxy && (
          <div className="reader-sec">
            <button
              className="btn"
              onClick={() => setShowPdf((v) => !v)}
            >
              {showPdf ? t.close : t.viewPdf} (PDF)
            </button>
            {showPdf && (
              <iframe
                className="reader-pdf"
                src={pdfProxy}
                title="PDF"
              />
            )}
          </div>
        )}

        <div className="reader-links">
          {data.url && (
            <a className="btn" href={data.url} target="_blank" rel="noopener noreferrer">
              {t.openOriginal} →
            </a>
          )}
          <button className="btn active" onClick={onDownload} disabled={downloading}>
            {downloading ? t.downloading : `↓ ${t.download}`}
          </button>
        </div>
      </div>
    </div>
  );
}
