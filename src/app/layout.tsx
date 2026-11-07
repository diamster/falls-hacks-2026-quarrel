import type { Metadata } from "next";
import "@fontsource-variable/pixelify-sans";
import "@fontsource-variable/dm-sans";
import "./globals.css";
import { DisplayPreferencesProvider } from "@/components/display-preferences";

export const metadata: Metadata = {
  title: "quarrel.io — Four worlds. One fair hearing.",
  description: "Private two-player rooms in four original pixel-art worlds: Jungle, Superhero, Detective and Courtroom.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><DisplayPreferencesProvider>{children}</DisplayPreferencesProvider></body></html>;
}
