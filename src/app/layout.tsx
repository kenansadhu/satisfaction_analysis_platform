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
  title: "Student Voice Platform",
  description: "Transforming raw student feedback into actionable intelligence.",
};

import { AnalysisProvider } from "@/context/AnalysisControlContext";
import { AnalysisProgressProvider } from "@/context/AnalysisProgressContext";
import { SurveyProvider } from "@/context/SurveyContext";
import { AuthProvider } from "@/context/AuthContext";

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
          <AuthProvider>
            <SurveyProvider>
              <AnalysisProgressProvider>
                <AnalysisProvider>
                  <AppShell>
                    {children}
                  </AppShell>
                </AnalysisProvider>
              </AnalysisProgressProvider>
            </SurveyProvider>
          </AuthProvider>
        </ThemeProvider>
        <Toaster richColors position="top-right" closeButton toastOptions={{ className: 'print:hidden' }} />
      </body>
    </html>
  );
}
