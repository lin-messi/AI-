// Read the same anonymous shared-view API used by the supplied public page. No session tokens saved.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { QA_SOURCE_URL, QA_APP, QA_VIEW, normalizeQARow, qaFingerprint } from "./rm-qa.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "data/rm-rules-qa.json");
const cookies = new Map(); // Anonymous public-view session, kept in memory for this run only.
async function api(endpoint, options = {}) {
  const response = await fetch(`https://qingflow.com/api/${endpoint}`, { ...options, headers: {
    ...options.headers, ...(cookies.size ? { cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join("; ") } : {}),
  }, signal: AbortSignal.timeout(25000) });
  for (const cookie of response.headers.getSetCookie()) {
    const [pair] = cookie.split(";"); const equals = pair.indexOf("=");
    if (equals > 0) cookies.set(pair.slice(0, equals), pair.slice(equals + 1));
  }
  if (!response.ok) throw new Error(`Q&A HTTP ${response.status}`);
  const json = await response.json();
  if (json.code !== 0 || !json.data) throw new Error(`Q&A unavailable (${json.code}); keep previous snapshot`);
  return json.data;
}
async function main() {
  const workspace = await api(`ws/workspaceAndMemberInfo?type=FORM&key=${QA_APP}`);
  if (!workspace.wsId) throw new Error("Public workspace metadata missing");
  const headers = { "content-type": "application/json", wsid: String(workspace.wsId) };
  // Same anonymous bootstrap the shared page performs; no account login or saved token.
  await api(`external/info?appKey=${QA_APP}&externalToken=`, { headers });
  const base = await api(`view/${QA_VIEW}/apply/baseInfo`, { headers });
  if (!/2027.*规则答疑/.test(base.formTitle || "")) throw new Error("Q&A title/season changed; review before import");
  const rows = [];
  let total;
  for (let pageNum = 1; ; pageNum++) {
    if (pageNum > 200) throw new Error("Unexpected Q&A pagination limit");
    const data = await api(`view/${QA_VIEW}/apply/filter`, { method: "POST", headers, body: JSON.stringify({ filter: {
      pageSize: 50, pageNum, type: 8, sorts: [{ queId: 0, isAscend: false, queType: 8, sortType: "customFieldSort" }], queries: [], queryKey: null,
    } }) });
    const reportedTotal = Number(data.total);
    if (!Array.isArray(data.list) || !Number.isSafeInteger(reportedTotal) || reportedTotal < 1) throw new Error("Empty or changed Q&A schema");
    if (total !== undefined && total !== reportedTotal) throw new Error("Q&A changed during pagination; retry next run");
    total = reportedTotal;
    rows.push(...data.list.map(normalizeQARow));
    if (rows.length >= total) break;
    if (!data.list.length) throw new Error("Incomplete Q&A pagination");
  }
  if (new Set(rows.map(q => q.number)).size !== total || rows.length !== total) throw new Error("Missing or duplicate Q&A rows");
  const fingerprint = qaFingerprint(rows);
  try {
    if (JSON.parse(fs.readFileSync(out, "utf8")).fingerprint === fingerprint) { console.log("规则答疑未变化"); return; }
  } catch {}
  const payload = { title: base.formTitle, season: "2027", source_url: QA_SOURCE_URL,
    fetchedAt: new Date().toISOString(), fingerprint, count: rows.length,
    note: "公开规则答疑原始问答；仅官方反馈具有答复意义。附图未识别的条目不能直接作完整判断；待更新说明不等于已生效条款。", items: rows };
  fs.writeFileSync(out, JSON.stringify(payload, null, 2) + "\n");
  console.log(`已读取 ${rows.length} 条规则答疑，其中空中系统相关 ${rows.filter(q => q.aerial).length} 条；已排除学校、战队、用户身份及会话信息。`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
