// Preserve relevant sections throughout a long manual, rather than only its first 22k chars.
export function selectRuleText(raw, limit) {
  const clean = raw.replace(/\r/g, "");
  const pages = clean.includes("\f") ? clean.split("\f") : (clean.match(/[\s\S]{1,2400}/g) || []);
  if (raw.length <= limit) return raw;
  const terms = ["空中", "机库", "全自动", "哨兵", "雷达", "重装", "能量机关", "制作参数", "新赛季主要变更"];
  const ranked = pages.map((text, i) => ({ text, i, score: terms.reduce((s, k) => s + (text.includes(k) ? 1 : 0), 0) }))
    .filter(p => !/\.{10}/.test(p.text)) // skip tables of contents
    .sort((a, b) => b.score - a.score || a.i - b.i);
  const chosen = new Map();
  let size = 0;
  for (const p of [{ i: 0, text: pages[0].slice(0, 1500) }, ...ranked]) {
    if (chosen.has(p.i)) continue;
    const block = `\n[PDF page ${p.i + 1}]\n${p.text}\n`;
    if (size + block.length > limit) continue;
    chosen.set(p.i, block);
    size += block.length;
  }
  return [...chosen.entries()].sort((a, b) => a[0] - b[0]).map(([, text]) => text).join("");
}

export function validateAerialCoverage(extracted, docs) {
  const corpus = docs.map(d => d.text).join("\n");
  if (/空中机器人/.test(corpus) && /机库/.test(corpus) && /全自动/.test(corpus)
      && !(extracted.tasks || []).some(t => (t.categories || []).includes("aerial"))) {
    throw new Error("手册含全自动空中系统，但提炼缺少 aerial 任务。保留旧规则，请重新提炼并复核空中系统章节。");
  }
}
