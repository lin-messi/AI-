// Optical-link eligibility and evidence-based recommendation lanes. No collector imports.
const YEAR = 365.25 * 86400000;
const RECEIVERS = new Set(["camera", "rolling_shutter_camera", "event_camera", "photodiode", "led", "unknown"]);
const clean = value => String(value || "").toLowerCase().replace(/[‐‑–—_-]/g, " ").replace(/\s+/g, " ");
const httpURL = value => {
  try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) ? url.href : ""; }
  catch { return ""; }
};
const stamp = (value, now) => {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) && time <= now ? time : null;
};
const sourceText = item => typeof item === "string" ? clean(item) : clean([
  item?.title_en, item?.title_zh, item?.abstract_en, item?.abstract_zh,
  item?.full_name, item?.name, item?.description_en, item?.description_zh,
  item?.readme_excerpt, ...(item?.topics || []),
].filter(Boolean).join(" "));

// Persist factual signals and a source link, rather than redistributing complete READMEs.
export function compactOpticalReadme(value) {
  // Keep actual context and negations; a bag of words can turn a historical
  // mention or "no photodiode" into a fabricated transmitter/receiver pair.
  return String(value || "").split(/\n\s*\n|(?<=[.!?])\s+/)
    .filter(part => /communication|transmi|receiv|photodiode|light sensor|firmware|RS485|binary|source code/i.test(part))
    .slice(0, 10).join(" ").slice(0, 1800);

}

export function opticalProfile(item) {
  const text = sourceText(item);
  const review = typeof item === "object" && item ? item.optical_review : null;
  const reviewURL = review?.verified === true ? httpURL(review.source_url) : "";
  const reviewed = Boolean(reviewURL);
  const reviewText = reviewed ? clean(review.reason_zh) : "";
  const visible = /visible light|optical camera communication|\bocc\b|\blifi\b|li fi|可见光|光相机通信/.test(text + " " + reviewText);
  const led = /\bleds?\b|light emitting diode|发光二极管|通信灯|灯光通信/.test(text);
  const camera = /\bcameras?\b|rolling shutter|image sensor|相机|摄像|图像传感/.test(text);
  const event = /event camera|event based camera|dynamic vision sensor|事件相机/.test(text);
  const diode = !/no photodiode|without (?:a )?photodiode/.test(text) && /photodiode|photo diode|photodetector|photo detector|光电二极管|光电探测器/.test(text);
  const ledReceiver = /led.{0,20}(?:as a receiver|as receiver|receiver|接收)|reverse bias.{0,20}led|led.{0,20}reverse bias|led.{0,90}light sensor.{0,30}receive/.test(text);
  const communicate = /\bcommunication\b|\bcommunications\b|\bcommunicator\b|data (?:link|transfer|transmission|transceiver)|\bmodem\b|\btransceiver\b|\bdemodulat|\bmodulat|\bdecoder\b|\bdecoding\b|数据链|数据传输|通信|通讯|调制|解调|收发/.test(text);
  const hardware = /\bprototype\b|\btestbed\b|\bfirmware\b|\bcircuit\b|microcontroller|\bfpga\b|\barduino\b|\bstm32\b|\bbeaglebone\b|实测|实验平台|硬件实现|硬件原型|固件|原型|电路/.test(text)
    || (/\bhardware\b/.test(text) && /\bimplement|\bmeasur|real world|\bexperimental/.test(text));
  const theory = /\bnoma\b|\bris\b|reconfigurable intelligent|power allocation|resource allocation|secrecy rate|sum rate|ergodic capacity|资源分配|功率分配|智能反射/.test(text);
  const simulated = /\bsimulation\b|\bsimulated\b|\bnumerical\b|\btheoretical\b|\banalytical\b|仿真|数值模拟|理论分析/.test(text);
  const excluded = reason => ({ relevant: false, receiver: "unknown", quality: "excluded", reason_zh: reason, matches: [], evidence_url: "", limitations_zh: "" });
  const identity = typeof item === "object" ? String(item.full_name || "").toLowerCase() : "";
  // Audited primary repositories: historical optical mentions are not their own
  // reusable data-link implementation. Keep these identities separate from words.
  if (identity === "tomer27cz/xt211") return excluded("RS485电表读数项目，历史光脉冲计数提及不是可见光数据链路实现");
  if (identity === "omron-sinicx/maru") return excluded("投影编码定位平台，控制依赖2.4GHz RF且固件仅二进制，未提供可复用通信源代码");
  // Acronyms and stars are not optical evidence, including the unrelated VideoLAN player.
  if (/videolan|libvlc|vlc media player|video player|media player|视频播放器|影音播放/.test(text)
      && !(visible && led && communicate && (camera || diode || ledReceiver))) return excluded("视频播放项目，与可见光数据链路无关");
  if (/infrared|near infrared|\bir\b|红外/.test(text) && !visible) return excluded("仅有红外链路，未证实可见光收发");
  if (/\bfib(?:er|re)\b|optical fibre|optical fiber|光纤/.test(text)
      && !/(?:visible light|可见光).{0,80}(?:wireless|free space|无线)|(?:wireless|无线).{0,80}(?:visible light|可见光)/.test(text)) return excluded("仅有光纤传输，未证实可见光无线收发");
  if (/(?:\blaser\b|free space optical|\bfso\b|激光)/.test(text) && !led && !/可见光|visible light|optical camera communication/.test(text)) return excluded("激光或远程自由空间光链路，未证实可见光器件实现");

  const pair = led && (camera || event || diode || ledReceiver);
  const subject = communicate && (visible || pair);
  const verifiedImplementation = reviewed && review.kind !== "survey" && review.kind !== "simulation";
  const primary = typeof item === "string" ? text : clean([item?.title_en, item?.title_zh, item?.description_en].filter(Boolean).join(" "));
  const survey = reviewed && review.kind === "survey" || (!verifiedImplementation && /\bsurvey\b|systematic review|文献综述|研究综述/.test(primary));
  let receiver = "unknown";
  if (reviewed && RECEIVERS.has(review.receiver)) receiver = review.receiver;
  else if (event) receiver = "event_camera";
  else if (/rolling shutter|滚动快门/.test(text)) receiver = "rolling_shutter_camera";
  else if (/photodiode.{0,25}receiver|photodetector.{0,25}receiver|光电二极管接收/.test(text)) receiver = "photodiode";
  else if (ledReceiver) receiver = "led";
  else if (camera) receiver = "camera";
  else if (diode) receiver = "photodiode";
  if (identity === "toggio/packetled") receiver = "led";
  const base = { receiver, evidence_url: reviewURL || (typeof item === "object" ? httpURL(item?.url) : ""),
    limitations_zh: reviewed ? String(review.limitations_zh || "") : "", matches: [] };
  if (identity === "toggio/packetled") base.limitations_zh = "普通LED兼作收发器，不需要光电二极管；作者报告窄角透明LED视距链路最高2.5米、1024 bit/s，漫射LED仅厘米级，不能直接推定运动无人机性能。";
  if (!subject) return { ...base, relevant: false, quality: "background", reason_zh: "缺少明确可见光数据传输与收发器件关系" };
  if (survey) return { ...base, relevant: false, quality: "background", reason_zh: "可见光通信综述，可作背景阅读，未核验可复现收发实现" };
  if (theory && !hardware && !verifiedImplementation) return { ...base, relevant: false, quality: "background", reason_zh: "通信资源分配或信道理论，缺少可核验收发实现" };
  if (simulated && !hardware && !reviewed) return { ...base, relevant: false, quality: "background", reason_zh: "只有数值或信道仿真，未核验可复现实机或实现代码" };
  if (!pair && !verifiedImplementation && !(visible && hardware && receiver !== "unknown")) return { ...base, relevant: false, quality: "background", reason_zh: "涉及可见光通信，但缺少具体收发器件或已核验实现" };
  const quality = (reviewed && review.kind === "simulation") || (simulated && !hardware && !verifiedImplementation) ? "simulation" : "implementation";
  const matches = [visible ? "可见光通信主体" : "LED 收发器件关系", communicate ? "明确数据传输或调制解调" : "", pair ? "明确发射与接收器件" : "已核验实现"].filter(Boolean);
  const reason = reviewed && review.reason_zh ? String(review.reason_zh) : quality === "simulation"
    ? "LED 收发链路仿真，可作算法参考，尚不能当作硬件实现"
    : receiver === "event_camera" ? "事件相机接收的可见光数据链路"
    : ["camera", "rolling_shutter_camera"].includes(receiver) ? "LED–相机数据链路，可参考编码、同步与接收解码"
    : receiver === "photodiode" ? "LED–光电探测器数据链路，可参考收发与调制解调"
    : receiver === "led" ? "LED 接收或双向 LED 数据链路"
    : "已核验可见光通信实现；接收器类型尚未明确";
  if (!visible && !base.limitations_zh) base.limitations_zh = "需进一步核对光谱、光源与接收器条件，不能仅凭 LED 名称认定符合比赛要求";
  return { ...base, relevant: true, quality, reason_zh: reason, matches };
}

export function isOpticalRelevant(itemOrString) { return opticalProfile(itemOrString).relevant; }

export function rejectUnrelatedOpticalTopic(item) {
  const text = sourceText(item);
  if (!item.optical_query && !/visible light|optical camera communication|可见光通信/.test(text)) return false;
  if (isOpticalRelevant(item)) return false;
  // A real navigation/SLAM paper may still be useful outside the optical-link category.
  const independent = /robomaster|auto aim|armor detection|power rune|\bslam\b|visual odometry|autonomous navigation|robot navigation|motion planning/.test(text);
  return !independent;
}

export function recommendationProfile(item, kind = "paper", now = Date.now()) {
  const profile = opticalProfile(item);
  const repo = kind === "repo";
  const published = stamp(repo ? item?.created_at : item?.published_at, now);
  const updated = stamp(repo ? item?.pushed_at : item?.published_at, now);
  const review = item?.optical_review;
  const verified = review?.verified === true && Boolean(httpURL(review.source_url));
  const age = published === null ? null : now - published;
  const recent = updated !== null && now - updated <= YEAR;
  const impact = item?.impact;
  const impactChecked = stamp(impact?.checked_at, now);
  const citations = impact?.source === "Crossref" && Number.isSafeInteger(impact.citations) && impact.citations >= 0
    && /^https:\/\/api\.crossref\.org\/works\//.test(impact.source_url || "") && impactChecked !== null ? impact.citations : null;
  const stars = Number.isSafeInteger(item?.stars) && item.stars >= 0 ? item.stars : null;
  const mature = age !== null && age >= 2 * YEAR;
  const established = mature && profile.quality === "implementation" &&
    (repo ? stars !== null && stars >= 100 && verified : citations !== null && citations >= 30);
  let lane = "reference";
  if (profile.relevant && profile.quality === "implementation") lane = established ? "established" : recent ? "recent" : "reference";
  let score = profile.relevant ? profile.quality === "simulation" ? 7 : 24 : 0;
  if (score && profile.quality === "implementation") {
    if (verified) score += 3;
    if (profile.receiver !== "unknown") score += 3;
    if (lane === "recent") score += 8 - Math.min(4, Math.floor((now - updated) / (YEAR / 4)));
    if (lane === "established") score += 5;
    // Popularity remains a bounded tie-break, never a substitute for practical relevance.
    if (repo && stars !== null) score += Math.min(2, Math.log10(stars + 1) / 2);
    if (!repo && citations !== null) score += Math.min(2, Math.log10(citations + 1) / 2);
  }
  let evidenceURL = profile.evidence_url;
  let metric;
  if (profile.relevant && !repo && citations !== null) {
    evidenceURL = httpURL(impact.source_url);
    metric = { label: "Crossref 引用计数", value: citations, source: "Crossref", source_url: evidenceURL, checked_at: impact.checked_at };
  } else if (profile.relevant && repo && stars !== null && httpURL(item.url)) {
    metric = { label: "GitHub Stars", value: stars, source: "GitHub", source_url: httpURL(item.url), checked_at: item.metadata_fetched_at || item.optical_review?.checked_at };
  }
  const laneReason = lane === "recent" ? repo ? "近一年有代码更新" : "近一年发表"
    : lane === "established" ? repo ? "长期项目，具有已核验实现与公开关注度记录" : "长期论文，具有可查询引用记录"
    : profile.quality === "simulation" ? "仅作仿真参考" : profile.relevant ? "参考资料，尚无近期或长期影响的充分证据" : "未进入精准推荐池";
  return { lane, score: Math.round(score * 100) / 100, reason_zh: `${profile.reason_zh.replace(/[。；;]+$/, "")}；${laneReason}`,
    receiver: profile.receiver, evidence_url: profile.evidence_url, limitations_zh: profile.limitations_zh,
    quality: profile.quality, ...(metric ? { metric } : {}) };
}
