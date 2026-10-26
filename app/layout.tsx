import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "PickSlix",
  description: "Over/under probabilities for DraftKings Pick 6 player props",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="topbar">
          <Link href="/" className="brand">
            Pick<span>Slix</span>
          </Link>
          <nav>
            <Link href="/">Board</Link>
            <Link href="/tracker">Tracker</Link>
          </nav>
        </header>
        <main>{children}</main>
        <footer className="foot">
          Probabilities are model estimates, not guarantees. Play responsibly. 1-800-GAMBLER.
        </footer>
      </body>
    </html>
  );
}
