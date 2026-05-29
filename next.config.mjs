/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    // 允许加载远程来源的配图（后续接入真实抓取时使用）
    remotePatterns: [
      { protocol: "https", hostname: "**" },
    ],
  },
  // 确保 data 目录在 Vercel 等平台被打包进服务端函数（页面运行时用 fs 读取）
  outputFileTracingIncludes: {
    "/": ["./data/**/*"],
    "/archive/[date]": ["./data/**/*"],
  },
};

export default nextConfig;
