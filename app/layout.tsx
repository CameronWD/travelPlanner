import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/ui/theme-provider";
import { MotionProvider } from "@/components/ui/motion-provider";
import { Toaster } from "@/components/ui/toaster";
import { PwaRegister } from "@/components/pwa-register";
import { VercelAnalytics } from "@/components/analytics";

// Display: Bricolage Grotesque (OFL, variable wght 200–800 + opsz). Headings use 800, h5 700.
const bricolage = Bricolage_Grotesque({
  variable: "--font-display-google",
  subsets: ["latin"],
  display: "swap",
  axes: ["opsz"],
});

// Body: Plus Jakarta Sans (OFL). 500 / 600 / 700 / 800 in use.
const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-sans-google",
  subsets: ["latin"],
  display: "swap",
});

export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FFFBF3" },
    { media: "(prefers-color-scheme: dark)", color: "#211F1B" },
  ],
};

export const metadata: Metadata = {
  title: { default: "Teepee", template: "%s · Teepee" },
  description: "Plan it with your people.",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon-16.png", sizes: "16x16" },
      { url: "/favicon-32.png", sizes: "32x32" },
    ],
    apple: "/apple-touch-icon.png",
    // mask-icon (Safari pinned tab) requires a literal colour per spec — it
    // cannot reference a CSS custom property/token. #FF6B4A is Playground coral.
    other: { rel: "mask-icon", url: "/safari-pinned-tab.svg", color: "#FF6B4A" },
  },
  appleWebApp: { capable: true, title: "Teepee", statusBarStyle: "default" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning className={`${plusJakarta.variable} ${bricolage.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <ThemeProvider>
          <MotionProvider>
            {children}
            <Toaster />
            <PwaRegister />
            <VercelAnalytics />
          </MotionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
