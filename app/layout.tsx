import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Pinfaces — Your photos. Your control.",
  description:
    "Find copies of your photographs on the web with Google Lens. Real source links, transparent privacy, no fabricated matches.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
