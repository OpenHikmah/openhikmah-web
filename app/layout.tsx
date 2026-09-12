import type { Metadata } from "next";
import { Geist, Geist_Mono, Amiri } from "next/font/google";
import { GoogleAnalytics } from "@next/third-parties/google";
import { getMessages } from "next-intl/server";
import { headers } from "next/headers";
import "./globals.css";
import { Providers } from "@/components/providers";
import { getUiLocale } from "@/lib/i18n/request-prefs";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const amiri = Amiri({
  variable: "--font-amiri",
  subsets: ["arabic", "latin"],
  weight: ["400", "700"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://openhikmah.com"),
  title: "Open Hikmah",
  description:
    "Explore the Quran through semantic connections — an infinite traversal canvas for discovering how verses, themes, and divine attributes interweave.",
  keywords: ["Quran", "Islamic", "theology", "semantic search", "knowledge graph"],
  openGraph: {
    type: "website",
    url: "https://openhikmah.com",
    title: "Open Hikmah",
    description:
      "Explore the Quran through semantic connections — an infinite traversal canvas for discovering how verses, themes, and divine attributes interweave.",
    siteName: "Open Hikmah",
  },
  twitter: {
    card: "summary_large_image",
    title: "Open Hikmah",
    description:
      "Explore the Quran through semantic connections — an infinite traversal canvas for discovering how verses, themes, and divine attributes interweave.",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getUiLocale();
  const messages = await getMessages();
  // Reading headers() opts this layout into dynamic rendering, which nonce'd
  // CSP requires anyway (see proxy.ts) — a static render has no per-request
  // nonce to read. Falls back to undefined on a route proxy.ts's matcher
  // excludes (no x-nonce set there); GoogleAnalytics just omits the attribute.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html
      lang={locale}
      className={`${geistSans.variable} ${geistMono.variable} ${amiri.variable} h-full`}
    >
      <body className="min-h-full flex flex-col antialiased">
        <Providers locale={locale} messages={messages}>
          {children}
        </Providers>
      </body>
      <GoogleAnalytics gaId="G-7R460Z8BZX" nonce={nonce} />
    </html>
  );
}
