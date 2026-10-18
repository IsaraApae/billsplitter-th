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
};

// Runs before paint so there's no light/dark flash, and keeps the theme in
// step everywhere: the light/dark class, <meta name="theme-color"> (the
// --edge-solid colour, which iPhone in-app browsers paint behind the status
// bar and their toolbar), and following the system setting while on "Auto".
// In-app browsers only re-read that colour when a fixed element changes, so
// after a theme change the fixed background is swapped for a fresh copy.
const themeScript = `(function(){try{
var d=document.documentElement,mq=matchMedia('(prefers-color-scheme: dark)');
function pref(){try{return localStorage.getItem('bs:theme')}catch(e){return null}}
function meta(){var c=getComputedStyle(d).getPropertyValue('--edge-solid').trim()||(d.classList.contains('dark')?'#04110d':'#eaf1f2');var m=document.querySelector('meta[name="theme-color"]');if(!m){m=document.createElement('meta');m.name='theme-color';document.head.appendChild(m)}m.setAttribute('content',c)}
function apply(){var t=pref();d.classList.toggle('dark',t==='dark'||(t!=='light'&&mq.matches));meta()}
function changed(){apply();setTimeout(function(){meta();document.querySelectorAll('.app-bg').forEach(function(el){el.replaceWith(el.cloneNode(true))})},50)}
apply();
var auto=function(){var t=pref();if(t!=='light'&&t!=='dark')changed()};
mq.addEventListener?mq.addEventListener('change',auto):mq.addListener(auto);
addEventListener('bs-theme',changed);
addEventListener('storage',function(e){if(e.key==='bs:theme')changed()});
document.addEventListener('DOMContentLoaded',meta);addEventListener('load',meta);
}catch(e){}})()`;
// The fixed wash is outside React's control (static HTML) so the theme script
// can swap it for a fresh copy safely.
const appBg = '<div class="app-bg" aria-hidden="true"></div>';
const swScript = `if('serviceWorker' in navigator&&location.hostname!=='localhost'){addEventListener('load',function(){navigator.serviceWorker.register('/sw.js').catch(function(){})})}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="theme-color" content="#eaf1f2" />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-dvh font-sans">
        <div id="strip" aria-hidden />
        <div dangerouslySetInnerHTML={{ __html: appBg }} />
        {/* Content blurs progressively under the floating navigation instead of hitting a solid bar. */}
        <div className="edge-blur edge-blur-bottom md:hidden" aria-hidden>
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>
        <div className="edge-blur edge-blur-top hidden md:block" aria-hidden />
        <div className="pt-[max(16px,env(safe-area-inset-top))] md:pt-24">{children}</div>
        <NavLinks />
        <ConfirmHost />
        <script dangerouslySetInnerHTML={{ __html: swScript }} />
      </body>
    </html>
  );
}
