import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Noto_Sans_Thai } from "next/font/google";
import Link from "next/link";
import { ThemeToggle } from "@/components/ThemeToggle";
import { siteUrl } from "@/lib/site";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const thai = Noto_Sans_Thai({ variable: "--font-thai", subsets: ["thai"], weight: ["400", "500", "600", "700"] });

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
    { media: "(prefers-color-scheme: light)", color: "#f6f7f9" },
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
  ],
};

// Runs before paint so there's no light/dark flash.
const themeScript = `try{var t=localStorage.getItem('bs:theme');var d=t==='dark'||(t!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d)}catch(e){}`;
const swScript = `if('serviceWorker' in navigator&&location.hostname!=='localhost'){addEventListener('load',function(){navigator.serviceWorker.register('/sw.js').catch(function(){})})}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${thai.variable} antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-dvh font-sans text-zinc-900 dark:text-zinc-100">
        <header className="sticky top-0 z-30 border-b border-zinc-200/70 bg-[var(--bg)]/85 backdrop-blur dark:border-zinc-800/70">
          <div className="mx-auto flex h-14 max-w-2xl items-center gap-2 px-4">
            <Link href="/" className="flex min-h-11 items-center gap-2 font-bold tracking-tight">
              <span className="grid size-8 place-items-center rounded-lg bg-emerald-600 text-white dark:bg-emerald-500 dark:text-zinc-950">
                ÷
              </span>
              Bill Splitter
            </Link>
            <div className="ml-auto flex items-center gap-1">
              <Link href="/history" className="btn-ghost px-3">
                History
              </Link>
              <ThemeToggle />
            </div>
          </div>
        </header>
        {children}
        <script dangerouslySetInnerHTML={{ __html: swScript }} />
      </body>
    </html>
  );
}
