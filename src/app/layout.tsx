import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
  title: {
    default: "speedyturtle — autonomous AI security for SMBs",
    template: "%s · speedyturtle",
  },
  description:
    "Mythos-inspired offensive scanning, blue-team hardening, and a public CTI-REALM scoreboard — built for businesses that don't have a $50K Snyk contract.",
  openGraph: {
    title: "speedyturtle — autonomous AI security for SMBs",
    description:
      "Mythos-inspired offensive scanning + a public CTI-REALM scoreboard. Five world-first reasoning layers in a productized SaaS.",
    type: "website",
  },
  icons: {
    icon: "/icon.svg",
  },
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
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
