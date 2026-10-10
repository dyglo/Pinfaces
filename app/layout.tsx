import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Pinfaces — Recognition with verified permission.",
  description:
    "Find your own photographs across authorized participating websites with verified adult enrollment and explicit biometric consent.",
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
