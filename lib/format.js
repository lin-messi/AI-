// 时间与日期格式化工具

export function formatDateLong(dateStr, lang) {
  const d = new Date(dateStr + "T00:00:00");
  if (lang === "en") {
    return d.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }
  return d.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });
}

// 相对时间（几小时前 / x hours ago）
export function timeAgo(iso, lang) {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.max(0, now - then);
  const min = Math.floor(diff / 60000);
  const hr = Math.floor(min / 60);
  const day = Math.floor(hr / 24);

  if (lang === "en") {
    if (min < 1) return "just now";
    if (min < 60) return `${min} min ago`;
    if (hr < 24) return `${hr} hr ago`;
    return `${day} day${day > 1 ? "s" : ""} ago`;
  }
  if (min < 1) return "刚刚";
  if (min < 60) return `${min} 分钟前`;
  if (hr < 24) return `${hr} 小时前`;
  return `${day} 天前`;
}
