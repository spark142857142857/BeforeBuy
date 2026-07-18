import type { Metadata } from "next";
import "./globals.css";

function metadataBase() {
  try {
    const url = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000");
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("unsupported protocol");
    return url;
  } catch {
    return new URL("http://localhost:3000");
  }
}

export const metadata: Metadata = {
  metadataBase: metadataBase(),
  title: { default: "BEFORE BUY — 한국 주식 투자 대안 탐색", template: "%s | BEFORE BUY" },
  description: "관심 있는 한국 종목과 사업이 닮은 국내외 기업·ETF를 비교해보세요.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
  openGraph: {
    title: "BEFORE BUY — 이 종목을 사기 전, 다른 선택지도 보셨나요?",
    description: "한국 종목과 사업이 닮은 국내외 기업·ETF를 비교해보세요.",
    images: [{ url: "/og.png", width: 1728, height: 909, alt: "BEFORE BUY 투자 대안 탐색 서비스" }],
    type: "website",
  },
  twitter: { card: "summary_large_image", images: ["/og.png"] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
