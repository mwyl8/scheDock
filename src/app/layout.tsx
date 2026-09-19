import type { Metadata } from "next";
import { IBM_Plex_Mono, Sora, Syne } from "next/font/google";
import Link from "next/link";
import { PierMark } from "@/components/PierMark";
import "./globals.css";

const syne = Syne({
  variable: "--font-syne",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
});

const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "scheDock - Harbor berth board",
  description: "Berth assignments for Harborview Marine Research Center",
};

const NAV = [
  { href: "/", label: "Tide board" },
  { href: "/reservations/new", label: "Assign berth" },
  { href: "/vessels", label: "Fleet" },
  { href: "/issues", label: "Chart notes" },
];

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${syne.variable} ${sora.variable} ${ibmPlexMono.variable} antialiased`}>
        <header className="sticky top-0 z-40 border-b-2 border-ink bg-paper">
          <div className="mx-auto flex max-w-[1500px] items-stretch">
            <Link
              href="/"
              className="font-display flex shrink-0 items-center gap-2 border-r-2 border-ink bg-accent px-4 py-3 text-lg font-extrabold tracking-tight text-paper sm:px-5 sm:text-2xl"
            >
              <PierMark className="hidden text-paper sm:block" />
              scheDock
            </Link>
            <nav className="flex flex-1 flex-wrap items-center gap-0 text-sm font-medium">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="border-r-2 border-ink px-3 py-3 hover:bg-ink hover:text-paper sm:px-4"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            <div className="hidden items-center gap-2 border-l-2 border-ink px-4 font-mono text-[11px] uppercase tracking-wider text-muted lg:flex">
              <span className="inline-block h-2 w-2 bg-accent" aria-hidden />
              Harborview · dock ops
            </div>
          </div>
          <div className="waterline" aria-hidden />
        </header>
        <main className="mx-auto max-w-[1500px] px-3 py-6 sm:px-5 sm:py-8">{children}</main>
        <footer className="mx-auto max-w-[1500px] border-t-2 border-ink px-3 py-4 sm:px-5">
          <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-[11px] uppercase tracking-wider text-muted">
            <span>Whole berth · inclusive dates · no rafting</span>
            <span className="inline-flex items-center gap-2">
              <PierMark className="text-ink" />
              Pier & float board
            </span>
          </div>
        </footer>
      </body>
    </html>
  );
}
