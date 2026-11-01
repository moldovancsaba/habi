import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@sovereignsquad/gds-theme/styles.css";
import "./globals.css";
import HabiGdsProvider from "./gds-provider";

export const metadata: Metadata = {
  title: "Habi · Sportolói támogatás",
  description: "Játékosok, családok és edzők közös sportolói támogatása.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="hu">
      <body>
        <HabiGdsProvider>{children}</HabiGdsProvider>
      </body>
    </html>
  );
}
