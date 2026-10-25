import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CHOKEPOINT — shipping blockage simulator",
  description: "Drop blockages on the world's sea lanes and see modelled trade, country and commodity impact.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#070B12" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
