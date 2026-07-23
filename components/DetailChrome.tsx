import Link from "next/link";
import type { ReactNode } from "react";

export function DetailHeader() {
  return (
    <header className="site-header detail-header">
      <Link className="brand" href="/">
        <span className="brand-mark">B</span><span>BEFORE BUY</span>
      </Link>
      <nav>
        <Link href="/">다른 종목 찾기</Link>
      </nav>
    </header>
  );
}

export function DetailFooter({ children }: { children: ReactNode }) {
  return (
    <footer className="site-footer shell">
      <div className="brand"><span className="brand-mark">B</span><span>BEFORE BUY</span></div>
      <p>{children}</p>
    </footer>
  );
}
