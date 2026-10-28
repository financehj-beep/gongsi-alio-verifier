import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "공시 알리오 사전검증기",
  description: "알리오 입력 전에 부점 한글파일과 공시된 웹페이지를 비교하고 공시 매뉴얼 준수 여부를 검증합니다.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
