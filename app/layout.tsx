import type { Metadata, Viewport } from "next";
import Link from "next/link";
import Logo from "@/components/Logo";
import Nav from "@/components/Nav";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "PickSlix", template: "%s · PickSlix" },
  description: "Over/under probabilities for DraftKings Pick 6 player props, from recent games, matchups and injury news.",
  applicationName: "PickSlix",
  appleWebApp: { capable: true, title: "PickSlix", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#0b0f14",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="topbar">
          <Link href="/" className="brand" aria-label="PickSlix home">
            <Logo />
            <span className="wordmark">
              Pick<span>Slix</span>
            </span>
          </Link>
          <Nav />
        </header>
        <main>{children}</main>
        <footer className="foot">
          Probabilities are model estimates from public stats, not guarantees. Not affiliated with DraftKings. 21+.
          Gambling problem? Call 1-800-GAMBLER.
        </footer>
      </body>
    </html>
  );
}
