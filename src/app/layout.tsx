import type { Metadata, Viewport } from "next";
import { ConfirmHost } from "@/components/ConfirmHost";
import { NavLinks } from "@/components/NavLinks";
import { siteUrl } from "@/lib/site";
import "./globals.css";

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
    { media: "(prefers-color-scheme: light)", color: "#f5f3f7" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

// Runs before paint so there's no light/dark flash.
const themeScript = `try{var t=localStorage.getItem('bs:theme');var d=t==='dark'||(t!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d)}catch(e){}`;
const swScript = `if('serviceWorker' in navigator&&location.hostname!=='localhost'){addEventListener('load',function(){navigator.serviceWorker.register('/sw.js').catch(function(){})})}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-dvh font-sans">
        <div className="app-bg" aria-hidden />
        {/* Content fades under the floating chrome instead of hitting a solid bar. */}
        <div className="edge-blur edge-blur-bottom md:hidden" aria-hidden />
        <div className="edge-blur edge-blur-top hidden md:block" aria-hidden />
        <div className="pt-[max(16px,env(safe-area-inset-top))] md:pt-24">{children}</div>
        <NavLinks />
        <ConfirmHost />
        <script dangerouslySetInnerHTML={{ __html: swScript }} />
      </body>
    </html>
  );
}
