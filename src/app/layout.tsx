import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
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
  title: "SSI UPH Analytics",
  description: "Helping LP2MU by transforming raw student feedback into actionable intelligence.",
};

import { AnalysisProvider } from "@/context/AnalysisContext";

import { ThemeProvider } from "@/components/ThemeProvider";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <AnalysisProvider>
            <AppShell>
              {children}
            </AppShell>
          </AnalysisProvider>
        </ThemeProvider>
        <Toaster richColors position="top-right" closeButton toastOptions={{ className: 'print:hidden' }} />
      </body>
    </html>
  );
}
