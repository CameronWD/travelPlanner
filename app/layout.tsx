import type { Metadata, Viewport } from "next";
import { Space_Grotesk, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/ui/theme-provider";
import { MotionProvider } from "@/components/ui/motion-provider";
import { Toaster } from "@/components/ui/toaster";
import { PwaRegister } from "@/components/pwa-register";

// Space Grotesk is a variable font (weight axis 300–700): omitting `weight`
// keeps the full range, covering the 600 used across the heading scale and
// the 700/font-bold used on error/print headings.
const spaceGrotesk = Space_Grotesk({
  variable: "--font-display-google",
  subsets: ["latin"],
  display: "swap",
});

const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-sans-google",
  subsets: ["latin"],
  display: "swap",
});

export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FBF6EF" },
    { media: "(prefers-color-scheme: dark)", color: "#1A1411" },
  ],
};

export const metadata: Metadata = {
  title: "TEEPEE",
  description: "A place to house your travel.",
  appleWebApp: {
    capable: true,
    title: "TEEPEE",
    statusBarStyle: "default",
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
      suppressHydrationWarning
      className={`${plusJakarta.variable} ${spaceGrotesk.variable} h-full antialiased`}
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
