import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Habi · Sportolói támogatás",
  description: "Játékosok, családok és edzők közös sportolói támogatása.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="hu">
      <body>{children}</body>
    </html>
  );
}
