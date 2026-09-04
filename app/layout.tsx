import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Dependency Dashboard",
  description: "Centralized Dependency using Renovate",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* Lit (used by @khmyznikov/pwa-install) warns once per app about
            running in dev mode. Seed its own opt-out set before it loads
            so the dev build's known-harmless warning doesn't clutter the
            console; production builds never load this code path at all. */}
        <Script id="suppress-lit-dev-warning" strategy="beforeInteractive">
          {`(function(){try{globalThis.litIssuedWarnings=new Set(['dev-mode']);}catch(e){}})();`}
        </Script>
        {children}
      </body>
    </html>
  );
}
