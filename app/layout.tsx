import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const metadataBase = new URL(`${protocol}://${host}`);
  return {
    metadataBase,
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
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
