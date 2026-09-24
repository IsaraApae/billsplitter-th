import type { Metadata, Viewport } from "next";
import { Inter, Noto_Sans_Thai } from "next/font/google";
import Link from "next/link";
import { NavLinks } from "@/components/NavLinks";
import { siteUrl } from "@/lib/site";
import "./globals.css";

// System font first (SF Pro on Apple devices); Inter elsewhere; Noto for Thai.
const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });
const thai = Noto_Sans_Thai({ variable: "--font-thai", subsets: ["thai"], weight: ["400", "500", "600", "700"], display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: "Bill Splitter", template: "%s · Bill Splitter" },
  description: "Scan a receipt, split it with friends, share one link and track who has paid.",
  applicationName: "Bill Splitter",
  appleWebApp: { capable: true, title: "Bill Split", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#eef2f7" },
    { media: "(prefers-color-scheme: dark)", color: "#06080f" },
  ],
};

// Runs before paint so there's no light/dark flash.
const themeScript = `try{var t=localStorage.getItem('bs:theme');var d=t==='dark'||(t!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d)}catch(e){}`;
const swScript = `if('serviceWorker' in navigator&&location.hostname!=='localhost'){addEventListener('load',function(){navigator.serviceWorker.register('/sw.js').catch(function(){})})}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${thai.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-dvh font-sans">
        <div className="app-bg" aria-hidden />
        <header className="sticky top-0 z-30 px-3 pt-[max(0.5rem,env(safe-area-inset-top))]">
          <div className="glass mx-auto flex h-14 max-w-2xl items-center gap-1 rounded-full pr-1.5 pl-2">
            <Link href="/" className="flex min-h-11 items-center gap-2 rounded-full pr-3 pl-1 font-bold tracking-tight">
              <span className="grid size-9 place-items-center rounded-full bg-accent text-lg text-accent-ink shadow-[inset_0_1px_0_rgb(255_255_255/0.35)]">
                ÷
              </span>
              <span className="text-[17px]">Bill Splitter</span>
            </Link>
            <NavLinks />
          </div>
        </header>
        {children}
        <script dangerouslySetInnerHTML={{ __html: swScript }} />
      </body>
    </html>
  );
}
