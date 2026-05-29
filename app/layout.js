import "./globals.css";
import AppProvider from "@/components/AppProvider";

export const metadata = {
  title: "AI 时事跟踪 · 每日 AI 大事与冷知识",
  description:
    "每日自动追踪 AI 领域的重要进展、产品发布、政策与有趣事实，中英对照精选呈现。",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
};

// 在水合前设置主题，避免深浅模式闪烁
const themeScript = `
(function(){
  try {
    var t = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', t);
  } catch(e){
    document.documentElement.setAttribute('data-theme','dark');
  }
})();
`;

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <AppProvider>{children}</AppProvider>
      </body>
    </html>
  );
}
