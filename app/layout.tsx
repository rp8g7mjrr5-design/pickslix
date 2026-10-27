import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { ClerkProvider } from "@clerk/nextjs";
import { AccountButton, AccountProvider } from "@/components/Account";
import Logo from "@/components/Logo";
import Nav from "@/components/Nav";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "LegUp", template: "%s · LegUp" },
  description: "Over/under probabilities for DraftKings Pick 6 player props, from recent games, matchups and injury news.",
  applicationName: "LegUp",
  appleWebApp: { capable: true, title: "LegUp", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#0b0f14",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// Clerk's sign-in screens, in LegUp's colors.
const clerkLook = {
  variables: {
    colorPrimary: "#3dff9a",
    colorPrimaryForeground: "#062b0d",
    colorBackground: "#141a22",
    colorForeground: "#e8eef5",
    colorMutedForeground: "#8b97a6",
    colorInput: "#1c242f",
    colorInputForeground: "#e8eef5",
    colorNeutral: "#e8eef5",
    colorBorder: "#273140",
    borderRadius: "10px",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const page = (
    <html lang="en">
      <body>
        <AccountProvider>
        <header className="topbar">
          <Link href="/" className="brand" aria-label="LegUp home">
            <Logo />
            <span className="wordmark">
              Leg<span>Up</span>
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
          Gambling problem? Call 1-800-GAMBLER. <Link href="/help">How it works</Link> · <Link href="/setup">Setup check</Link>
          {process.env.NEXT_PUBLIC_TIP_URL && (
            <>
              {" · "}
              <a className="tiplink" href={process.env.NEXT_PUBLIC_TIP_URL} target="_blank" rel="noopener noreferrer">
                Leave a tip
              </a>
            </>
          )}
        </footer>
        </AccountProvider>
      </body>
    </html>
  );
  // Accounts are optional: without Clerk's key the site runs signed out.
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) return page;
  return <ClerkProvider appearance={clerkLook}>{page}</ClerkProvider>;
}
