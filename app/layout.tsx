import type { Metadata } from "next";
import { Fraunces, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/ui/theme-provider";
import { MotionProvider } from "@/components/ui/motion-provider";
import { Toaster } from "@/components/ui/toaster";
import { PwaRegister } from "@/components/pwa-register";

// Fraunces is a variable font: omitting `weight` keeps the full variable
// range (400–600 used in the type scale) and lets us enable optical sizing.
const fraunces = Fraunces({
  variable: "--font-display-google",
  subsets: ["latin"],
  axes: ["opsz"],
  display: "swap",
});

const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-sans-google",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Trip Planner",
  description: "Plan and run a holiday together.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${plusJakarta.variable} ${fraunces.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <ThemeProvider>
          <MotionProvider>
            {children}
            <Toaster />
            <PwaRegister />
          </MotionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
