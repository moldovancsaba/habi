"use client";

import type { ReactNode } from "react";
import { GdsProvider } from "@sovereignsquad/gds/client";
import { goldAthleteThemePreset } from "@sovereignsquad/gds-theme";

/** One GDS authority; feature components must not install nested theme providers. */
export default function HabiGdsProvider({ children }: { children: ReactNode }) {
  return (
    <GdsProvider
      locale="hu"
      theme={goldAthleteThemePreset}
      defaultColorScheme="light"
    >
      {children}
    </GdsProvider>
  );
}
