import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "../lib/auth";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  applicationName: "AURA Health",
  title: {
    default: "AURA — Remote Vitals & ECG Monitoring",
    template: "%s · AURA",
  },
  description:
    "Remote vitals and ECG monitoring for connected health devices. Engineering-prototype measurements for monitoring purposes — not a medical diagnosis.",
  keywords: ["ECG", "vitals", "remote monitoring", "ESP32", "telehealth"],
  openGraph: {
    type: "website",
    siteName: "AURA Health",
    title: "AURA — Remote Vitals & ECG Monitoring",
    description:
      "Live vitals and ECG streaming from your connected health monitor.",
  },
  robots: {
    index: false,
    follow: false,
  },
};

export const viewport: Viewport = {
  themeColor: "#121212",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
