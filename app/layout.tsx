import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "@/components/shell/Providers";

export const metadata: Metadata = { title: "Pollyn · Team polls & games", description: "Org polls, suggestions and randomiser games for Microsoft Teams" };
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

// Theme boot: apply saved theme before paint (no attribute = follow OS).
const themeBoot = `(function(){try{var t=localStorage.getItem("tp-theme");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeBoot }} /></head>
      <body>
        <div className="tp-bg" aria-hidden />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
