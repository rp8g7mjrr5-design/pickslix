import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { ClerkProvider } from "@clerk/nextjs";
import { AccountButton, AccountProvider } from "@/components/Account";
import Logo from "@/components/Logo";
import Nav from "@/components/Nav";
import { UsernameGate } from "@/components/Username";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "LayLock", template: "%s · LayLock" },
  description: "Over/under probabilities for DraftKings Pick 6 player props, from recent games, matchups and injury news.",
  applicationName: "LayLock",
  appleWebApp: { capable: true, title: "LayLock", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#07090d",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// Clerk's sign-in screens, in LayLock's colors.
const clerkLook = {
  variables: {
    colorPrimary: "#2bf59b",
    colorPrimaryForeground: "#07090d",
    colorBackground: "#11171f",
    colorForeground: "#eef3f8",
    colorMutedForeground: "#8a96a6",
    colorInput: "#161d27",
    colorInputForeground: "#eef3f8",
    colorNeutral: "#eef3f8",
    colorBorder: "#222b37",
    borderRadius: "10px",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const page = (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* Archivo Expanded Black is only used for the wordmark. */}
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@125,900&display=swap" />
      </head>
      <body>
        <AccountProvider>
        <header className="topbar">
          <Link href="/" className="brand" aria-label="LayLock home">
            <Logo />
            <span className="wordmark">
              Lay<span>Lock</span>
            </span>
          </Link>
          <div className="topright">
            <Nav />
            <AccountButton />
          </div>
        </header>
        <main>{children}</main>
        <footer className="foot">
          Probabilities are model estimates from public stats, not guarantees. Not affiliated with DraftKings. 21+.
          Gambling problem? Call 1-800-GAMBLER. <Link href="/help">How it works</Link> · <Link href="/accuracy">Model accuracy</Link> ·{" "}
          <Link href="/setup">Setup check</Link>
          {process.env.NEXT_PUBLIC_TIP_URL && (
            <>
              {" · "}
              <a className="tiplink" href={process.env.NEXT_PUBLIC_TIP_URL} target="_blank" rel="noopener noreferrer">
                Leave a tip
              </a>
            </>
          )}
        </footer>
        <UsernameGate />
        </AccountProvider>
      </body>
    </html>
  );
  // Accounts are optional: without Clerk's key the site runs signed out.
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) return page;
  return <ClerkProvider appearance={clerkLook}>{page}</ClerkProvider>;
}
