import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Pinfaces — Your photos. Your control.",
  description:
    "Private, exact-image search in your own collection. Real face detection. No identity tracking, no public-web indexing.",
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
