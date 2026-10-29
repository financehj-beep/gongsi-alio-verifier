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
