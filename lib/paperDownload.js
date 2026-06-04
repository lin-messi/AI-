// 客户端「打包下载」：把论文/仓库的中文导读（题目双语、亮点、RM 用途、摘要、AI 精读、元信息）
// 渲染成 PDF 导读页，并在有原文 PDF 时把原文页接在后面，合成单个 PDF 下载。
//
// 关键点：
//   - 中文无法用 pdf-lib 内置的标准字体（Helvetica 只支持 WinAnsi）。这里改用浏览器 Canvas 2D
//     的 fillText（走系统字体，天然支持中文），把每一页导读画成 PNG，再用 pdf-lib 以整页图片嵌入。
//     这样无需打包任何中文字体文件。
//   - 原文 PDF 通过同域代理 /api/paper-pdf 拉取字节（白名单 arxiv/biorxiv/medrxiv），用 pdf-lib 复制页面追加。
//   - 若原文 PDF 拉取/解析失败，则只导出导读页（不阻断下载）。
//   - pdf-lib 按需动态 import，避免进入首屏主包。

// —— 画布尺寸：与 A4 同比例（595.28 : 841.89 ≈ 1190 : 1684），便于整页贴图不变形 ——
const PAGE_W = 1190;
const PAGE_H = 1684;
const MARGIN = 84;
const USABLE_W = PAGE_W - MARGIN * 2;
const A4 = [595.28, 841.89];

const FONT_STACK =
  '"Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", "Source Han Sans", sans-serif';

// 把混合中英文按「可断点」切分：中文/标点按单字断，英文单词整体不拆，空白保留。
function tokenize(text) {
  const re =
    /[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]|[^\s\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]+|\s+/g;
  return String(text).match(re) || [];
}

function wrapText(ctx, text, maxWidth) {
  const lines = [];
  for (const para of String(text).split(/\n/)) {
    if (para === "") {
      lines.push("");
      continue;
    }
    let line = "";
    for (const tk of tokenize(para)) {
      const test = line + tk;
      if (line && ctx.measureText(test).width > maxWidth) {
        lines.push(line.replace(/\s+$/, ""));
        line = tk.replace(/^\s+/, "");
      } else {
        line = test;
      }
    }
    lines.push(line);
  }
  return lines;
}

// 逐页画布管理：累积内容，超出可用高度时自动翻页。
function createPager() {
  const pages = [];
  let canvas, ctx, y;

  function newPage() {
    canvas = document.createElement("canvas");
    canvas.width = PAGE_W;
    canvas.height = PAGE_H;
    ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, PAGE_W, PAGE_H);
    ctx.textBaseline = "top";
    y = MARGIN;
    pages.push(canvas);
  }
  newPage();

  function ensure(h) {
    if (y + h > PAGE_H - MARGIN) newPage();
  }

  // 画一段文字（自动换行 + 翻页）。返回结束后的 y。
  function paragraph(text, { size = 26, color = "#1f2328", bold = false, gap = 10, lineGap = 12 } = {}) {
    if (!text && text !== 0) return;
    ctx.font = `${bold ? "600 " : ""}${size}px ${FONT_STACK}`;
    const lineH = size + lineGap;
    const lines = wrapText(ctx, text, USABLE_W);
    for (const ln of lines) {
      ensure(lineH);
      ctx.font = `${bold ? "600 " : ""}${size}px ${FONT_STACK}`; // 翻页后需重设
      ctx.fillStyle = color;
      ctx.fillText(ln, MARGIN, y);
      y += lineH;
    }
    y += gap;
  }

  function heading(text, color = "#0b63d6") {
    ensure(40 + 16);
    ctx.font = `600 30px ${FONT_STACK}`;
    ctx.fillStyle = color;
    ctx.fillText(text, MARGIN, y);
    // 下划分隔线
    y += 38;
    ctx.strokeStyle = "#e3e7ec";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(MARGIN, y);
    ctx.lineTo(PAGE_W - MARGIN, y);
    ctx.stroke();
    y += 14;
  }

  function divider() {
    y += 6;
  }

  return {
    paragraph,
    heading,
    divider,
    pages: () => pages,
  };
}

async function canvasToPng(canvas) {
  const blob = await new Promise((res) => canvas.toBlob(res, "image/png"));
  if (!blob) throw new Error("canvas toBlob 失败");
  return new Uint8Array(await blob.arrayBuffer());
}

function sanitizeFilename(name) {
  return (
    String(name || "download")
      .replace(/[\\/:*?"<>|\n\r\t]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80) || "download"
  );
}

function nowStamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const USAGE_LABEL = { high: "实用度高", mid: "实用度中", low: "实用度低" };

// 渲染论文导读页 → PNG 数组
async function renderPaperNotes(p) {
  const pager = createPager();
  pager.paragraph(`AI 时事跟踪 · ${p.source || "arXiv"} · 下载于 ${nowStamp()}`, {
    size: 20,
    color: "#8a94a6",
    gap: 18,
  });

  // 题目（双语）
  pager.paragraph(p.title_zh || p.title_en || "(无标题)", {
    size: 40,
    bold: true,
    color: "#11161d",
    gap: 6,
    lineGap: 14,
  });
  if (p.title_en && p.title_zh && p.title_en !== p.title_zh) {
    pager.paragraph(p.title_en, { size: 24, color: "#5b6573", gap: 18 });
  }

  if (p.highlight_zh) {
    pager.heading("亮点");
    pager.paragraph(p.highlight_zh, { size: 26, color: "#1f2328", gap: 16 });
  }

  // RM 用途（仅在该论文带 rm.usage 时）
  if (p.rm?.usage) {
    pager.heading("RM 用途");
    const meta = [
      p.rm.value ? USAGE_LABEL[p.rm.value] || "" : "",
      p.rm.task ? `对应任务：${p.rm.task}` : "",
    ]
      .filter(Boolean)
      .join("　");
    if (meta) pager.paragraph(meta, { size: 22, color: "#0b63d6", gap: 8 });
    pager.paragraph(p.rm.usage, { size: 26, color: "#1f2328", gap: 16 });
  }

  if (p.digest_zh) {
    pager.heading("AI 精读");
    pager.paragraph(p.digest_zh, { size: 26, color: "#1f2328", gap: 16, lineGap: 14 });
  }

  if (p.abstract_zh || p.abstract_en) {
    pager.heading("摘要");
    if (p.abstract_zh) pager.paragraph(p.abstract_zh, { size: 26, color: "#1f2328", gap: 10 });
    if (p.abstract_en) pager.paragraph(p.abstract_en, { size: 22, color: "#5b6573", gap: 16 });
  }

  // 元信息
  const meta = [];
  if (p.published_at) meta.push(`发布时间：${String(p.published_at).slice(0, 10)}`);
  if (p.cats?.length) meta.push(`分类：${p.cats.slice(0, 4).join(", ")}`);
  if (p.url || p.html_url) meta.push(`原文：${p.url || p.html_url}`);
  if (p.pdf_url) meta.push(`PDF：${p.pdf_url}`);
  if (meta.length) {
    pager.heading("信息");
    pager.paragraph(meta.join("\n"), { size: 20, color: "#8a94a6", lineGap: 10 });
  }

  const canvases = pager.pages();
  return Promise.all(canvases.map(canvasToPng));
}

// 渲染仓库导读页（无原文 PDF）→ PNG 数组
async function renderRepoNotes(r) {
  const pager = createPager();
  pager.paragraph(`AI 时事跟踪 · GitHub · 下载于 ${nowStamp()}`, {
    size: 20,
    color: "#8a94a6",
    gap: 18,
  });
  pager.paragraph(r.full_name || r.name || "(repo)", {
    size: 38,
    bold: true,
    color: "#11161d",
    gap: 18,
    lineGap: 12,
  });

  if (r.highlight_zh) {
    pager.heading("亮点");
    pager.paragraph(r.highlight_zh, { size: 26, color: "#1f2328", gap: 16 });
  }
  if (r.rm?.usage) {
    pager.heading("RM 用途");
    const m = [
      r.rm.value ? USAGE_LABEL[r.rm.value] || "" : "",
      r.rm.task ? `对应任务：${r.rm.task}` : "",
    ]
      .filter(Boolean)
      .join("　");
    if (m) pager.paragraph(m, { size: 22, color: "#0b63d6", gap: 8 });
    pager.paragraph(r.rm.usage, { size: 26, color: "#1f2328", gap: 16 });
  }
  if (r.description_zh || r.description_en) {
    pager.heading("简介");
    if (r.description_zh) pager.paragraph(r.description_zh, { size: 26, color: "#1f2328", gap: 10 });
    if (r.description_en) pager.paragraph(r.description_en, { size: 22, color: "#5b6573", gap: 16 });
  }
  const meta = [];
  if (typeof r.stars === "number") meta.push(`Stars：${r.stars}`);
  if (r.language) meta.push(`主要语言：${r.language}`);
  if (r.topics?.length) meta.push(`标签：${r.topics.slice(0, 8).join(", ")}`);
  if (r.url) meta.push(`仓库：${r.url}`);
  if (r.homepage) meta.push(`主页：${r.homepage}`);
  if (meta.length) {
    pager.heading("信息");
    pager.paragraph(meta.join("\n"), { size: 20, color: "#8a94a6", lineGap: 10 });
  }
  const canvases = pager.pages();
  return Promise.all(canvases.map(canvasToPng));
}

// 拉取原文 PDF 字节（走同域代理，避免跨域/CSP）。失败返回 null。
async function fetchSourcePdf(pdfUrl) {
  if (!pdfUrl) return null;
  try {
    const res = await fetch(`/api/paper-pdf?url=${encodeURIComponent(pdfUrl)}`);
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") || "";
    const buf = new Uint8Array(await res.arrayBuffer());
    // 简单校验是否为 PDF（%PDF 魔数），html 错误页直接放弃
    if (!ct.includes("pdf") && !(buf[0] === 0x25 && buf[1] === 0x50)) return null;
    return buf;
  } catch {
    return null;
  }
}

// 若缺中文精读，按需调用 /api/translate 生成（与站内精读同一接口）。
async function ensureDigest(p) {
  if (p.digest_zh || !(p.abstract_en || p.abstract_zh)) return p;
  try {
    const res = await fetch("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: p.title_en, abstract: p.abstract_en }),
    });
    const j = await res.json();
    if (!j.error) {
      return {
        ...p,
        title_zh: p.title_zh || j.title_zh,
        abstract_zh: p.abstract_zh || j.abstract_zh,
        highlight_zh: p.highlight_zh || j.highlight_zh,
        digest_zh: j.digest_zh || p.digest_zh,
      };
    }
  } catch {}
  return p;
}

function triggerDownload(bytes, filename) {
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// 把导读 PNG 页 + 可选原文 PDF 合成单个 PDF。
async function buildPdf(notePngs, srcPdfBytes) {
  const { PDFDocument } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  for (const png of notePngs) {
    const img = await doc.embedPng(png);
    const page = doc.addPage(A4);
    page.drawImage(img, { x: 0, y: 0, width: A4[0], height: A4[1] });
  }
  if (srcPdfBytes) {
    try {
      const src = await PDFDocument.load(srcPdfBytes, { ignoreEncryption: true });
      const copied = await doc.copyPages(src, src.getPageIndices());
      copied.forEach((pg) => doc.addPage(pg));
    } catch {
      // 原文无法解析就只保留导读页
    }
  }
  return doc.save();
}

// 对外主入口：type = "paper" | "repo"
export async function downloadItem(item, { type = "paper" } = {}) {
  if (type === "repo") {
    const notes = await renderRepoNotes(item);
    const bytes = await buildPdf(notes, null);
    triggerDownload(bytes, `${sanitizeFilename(item.name || item.full_name)}.pdf`);
    return;
  }
  const enriched = await ensureDigest(item);
  const [notes, src] = await Promise.all([
    renderPaperNotes(enriched),
    fetchSourcePdf(enriched.pdf_url),
  ]);
  const bytes = await buildPdf(notes, src);
  triggerDownload(bytes, `${sanitizeFilename(enriched.title_zh || enriched.title_en)}.pdf`);
}
