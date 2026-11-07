import type { Metadata } from "next";
import "@fontsource-variable/pixelify-sans";
import "@fontsource-variable/dm-sans";
import "./globals.css";

export const metadata: Metadata = {
  title: "quarrel.io — The jungle court",
  description: "Big opinions. Jungle rules. An original pixel-art debate courtroom — Private two-player rooms in a tropical pixel-art courtroom.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
