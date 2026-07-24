import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import Nav from "@/components/Nav";
import { siteUrl } from "@/lib/og";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

const DESCRIPTION =
  "Live water levels, storage, and trends for every major reservoir in Texas, combining TWDB daily conditions with real-time USGS gage data.";

export const metadata: Metadata = {
  /*
   * Required for link previews: without it Next emits relative og:image URLs,
   * which Slack, iMessage and Twitter cannot resolve, so the card renders with
   * no image. Set NEXT_PUBLIC_SITE_URL in production.
   */
  metadataBase: new URL(siteUrl()),
  title: {
    default: "Texas Lake Levels",
    template: "%s · Texas Lake Levels",
  },
  description: DESCRIPTION,
  applicationName: "Texas Lake Levels",
  openGraph: {
    type: "website",
    siteName: "Texas Lake Levels",
    locale: "en_US",
    url: "/",
    title: "Texas Lake Levels",
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: "Texas Lake Levels",
    description: DESCRIPTION,
  },
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
};

/**
 * `viewport-fit=cover` lets the footer and header run under the notch/home
 * indicator on iPhones; the body padding below restores safe spacing.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7fafb" },
    { media: "(prefers-color-scheme: dark)", color: "#071013" },
  ],
};

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/map", label: "Map" },
  { href: "/basins", label: "Basins" },
  { href: "/cities", label: "Cities" },
  { href: "/compare", label: "Compare" },
  { href: "/drought", label: "Drought" },
  { href: "/groundwater", label: "Groundwater" },
  { href: "/about", label: "About" },
];

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <header className="border-b border-border bg-surface sticky top-0 z-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 flex items-center gap-3 sm:gap-6 h-14">
            <Link
              href="/"
              className="flex items-center gap-2 font-semibold shrink-0"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- static
                  24 KB pre-sized PNG; routing it through the image optimizer on
                  Workers buys nothing and adds a pipeline that isn't otherwise
                  used. */}
              <img
                src="/emblem.png"
                alt="LBJ Task Force emblem"
                width={26}
                height={26}
                className="shrink-0"
              />
              {/* The full wordmark plus four nav items overflows a 375px screen. */}
              <span className="hidden xs:inline">
                Texas<span className="text-accent"> Lake Levels</span>
              </span>
              <span className="xs:hidden">
                TX<span className="text-accent"> Lakes</span>
              </span>
            </Link>
            <Nav items={NAV} />
          </div>
        </header>

        <main className="flex-1 mx-auto w-full max-w-7xl px-4 sm:px-6 py-5 sm:py-6">
          {children}
        </main>

        <footer className="border-t border-border mt-8 pb-[env(safe-area-inset-bottom)]">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 py-6 text-xs text-muted space-y-1">
            <p className="flex items-center gap-2 pb-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/emblem.png"
                alt=""
                width={20}
                height={20}
                className="shrink-0 opacity-80"
              />
              <span className="font-medium">LBJ Task Force</span>
            </p>
            <p>
              Data from the{" "}
              <a
                className="underline hover:text-foreground"
                href="https://www.waterdatafortexas.org/reservoirs/statewide"
                target="_blank"
                rel="noreferrer"
              >
                Texas Water Development Board
              </a>{" "}
              and the{" "}
              <a
                className="underline hover:text-foreground"
                href="https://waterservices.usgs.gov/"
                target="_blank"
                rel="noreferrer"
              >
                USGS National Water Information System
              </a>
              .
            </p>
            <p>
              Provisional data subject to revision. Not for navigation, flood
              response, or life-safety decisions.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}

