import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PixelLab } from "./pixel-lab";

export const metadata: Metadata = { title: "Pixel Lab — quarrel.io", robots: { index: false } };

/** Local art review page. Hidden from production builds unless explicitly enabled. */
export default function Page() {
  if (process.env.NODE_ENV === "production" && process.env.QUARREL_PIXEL_LAB !== "true") notFound();
  return <PixelLab/>;
}
