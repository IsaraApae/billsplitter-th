import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { ConfirmHost } from "@/components/ConfirmHost";
import { NavLinks } from "@/components/NavLinks";
import { siteUrl } from "@/lib/site";
import "./globals.css";

const anybody = localFont({
  src: "../../assets/fonts/Anybody-Expanded-Black.woff2",
  weight: "900",
  variable: "--font-anybody",
  display: "swap",
  adjustFontFallback: false,
});
// Only fetched when something Thai (or a ฿) is set in the poster type.
const kanit = localFont({
  src: "../../assets/fonts/Kanit-ExtraBold-thai.woff2",
  weight: "900",
  variable: "--font-kanit",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  declarations: [{ prop: "unicode-range", value: "U+0E01-0E5B, U+200C-200D, U+25CC" }],
});

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
// Also runs the two things that must happen before first paint: collapsing the
// home poster when a draft is under way, and asking for the scene early on pages
// that show it.
const themeScript = `(function(){try{
var d=document.documentElement,mq=matchMedia('(prefers-color-scheme: dark)');
function pref(){try{return localStorage.getItem('bs:theme')}catch(e){return null}}
function meta(){var c=getComputedStyle(d).getPropertyValue('--edge-solid').trim()||(d.classList.contains('dark')?'#060d0a':'#eef4ee');var m=document.querySelector('meta[name="theme-color"]');if(!m){m=document.createElement('meta');m.name='theme-color';document.head.appendChild(m)}m.setAttribute('content',c)}
function apply(){var t=pref();d.classList.toggle('dark',t==='dark'||(t!=='light'&&mq.matches));meta()}
function changed(){apply();setTimeout(meta,50)}
apply();
try{var s=JSON.parse(localStorage.getItem('bs:draft'));if(s&&(s.step>0||(s.doc&&s.doc.items&&s.doc.items.length)))d.setAttribute('data-compact','')}catch(e){}
var p=location.pathname;if(p==='/'||p.indexOf('/s/')===0||p.indexOf('/e/')===0||p.indexOf('/o/')===0){var l=document.createElement('link');l.rel='preload';l.as='image';l.fetchPriority='high';l.href='/scene/'+(d.classList.contains('dark')?'night':'day')+'-'+(innerWidth>=900?1800:1000)+'.webp';document.head.appendChild(l)}
var auto=function(){var t=pref();if(t!=='light'&&t!=='dark')changed()};
mq.addEventListener?mq.addEventListener('change',auto):mq.addListener(auto);
addEventListener('bs-theme',changed);
addEventListener('storage',function(e){if(e.key==='bs:theme')changed()});
document.addEventListener('DOMContentLoaded',meta);addEventListener('load',meta);
}catch(e){}})()`;
const swScript = `if('serviceWorker' in navigator&&location.hostname!=='localhost'){addEventListener('load',function(){navigator.serviceWorker.register('/sw.js').catch(function(){})})}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${anybody.variable} ${kanit.variable}`} suppressHydrationWarning>
      <head>
        <meta name="theme-color" content="#eef4ee" />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-dvh font-sans">
        <div className="page-top">
          {children}
          {/* The meadow at the end of every page; never loaded until it's near the screen. */}
          <div className="meadow" aria-hidden>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="meadow-day" src="/meadow/day.webp" alt="" width={1300} height={272} loading="lazy" decoding="async" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="meadow-night" src="/meadow/night.webp" alt="" width={1300} height={272} loading="lazy" decoding="async" />
          </div>
        </div>
        <NavLinks />
        <ConfirmHost />
        <script dangerouslySetInnerHTML={{ __html: swScript }} />
      </body>
    </html>
  );
}
