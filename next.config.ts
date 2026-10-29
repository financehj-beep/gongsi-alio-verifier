import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // 서버가 읽는 파일은 코드만 봐서는 알 수 없으므로, 배포할 때 함께 담도록 알려준다
  // (PDF 매뉴얼의 한글 글자 변환표와 앱에 미리 넣은 샘플 매뉴얼)
  outputFileTracingIncludes: {
    "/api/**": ["./node_modules/pdfjs-dist/cmaps/**/*", "./data/sample-manual/**/*"],
  },
  // 보안 헤더: 다른 사이트가 이 화면을 겹쳐 띄워 버튼을 누르게 속이는 것(클릭재킹)과 글자 형식 속임을 막는다
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
