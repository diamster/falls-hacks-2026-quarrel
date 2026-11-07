import type { ButtonHTMLAttributes, ReactNode } from "react";

export function PixelIcon({name, className = ""}: {name: "gavel" | "leaf" | "spark" | "arrow" | "clock" | "pause" | "play" | "reset" | "chat" | "close"; className?: string}) {
  const paths = {
    gavel: "M3 3h9v3h3v3h-3v3H9V9H6V6H3zM11 11h3v3h3v3h-3v-3h-3zM3 18h15v3H3z",
    leaf: "M6 3h15v9h-3v3h-3v3H9v-3H6v-3H3V6h3zM3 18h3v3H3z",
    spark: "M9 0h3v6h3v3h6v3h-6v3h-3v6H9v-6H6v-3H0V9h6V6h3z",
    arrow: "M12 3h3v3h3v3h3v3h-3v3h-3v3h-3v-6H0V9h12z",
    clock: "M6 0h9v3h3v3h3v9h-3v3h-3v3H6v-3H3v-3H0V6h3V3h3zM9 4v8h6V9h-3V4z",
    pause: "M3 3h6v15H3zM12 3h6v15h-6z",
    play: "M3 0h3v3h6v3h3v3h6v3h-6v3h-3v3H6v3H3z",
    reset: "M3 3h3v3h3V3h9v3h3v12h-3v3H6v-3H3v-3h3v3h12V6H9v3h3v3H0V0h3z",
    chat: "M3 0h15v3h3v12h-3v3H9v3H3v-6H0V3h3zM4 6v3h3V6zM9 6v3h3V6zM14 6v3h3V6z",
    close: "M0 0h3v3h3v3h3V3h3V0h3v3h-3v3H9v3h3v3h3v3h-3v-3H9V9H6v3H3v3H0v-3h3V9h3V6H3V3H0z",
  };
  return <svg aria-hidden="true" className={`pixel-icon ${className}`} viewBox="0 0 24 24" shapeRendering="crispEdges"><path fill="currentColor" fillRule="evenodd" d={paths[name]}/></svg>;
}

export function PixelButton({children, tone = "green", className = "", ...props}: ButtonHTMLAttributes<HTMLButtonElement> & {children: ReactNode; tone?: "green" | "orange" | "cream" | "ghost"}) {
  return <button {...props} className={`pixel-button pixel-button--${tone} ${className}`}>{children}</button>;
}

export function SectionHeading({eyebrow, children, aside}: {eyebrow?: string; children: ReactNode; aside?: ReactNode}) {
  return <div className="section-heading"><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h2>{children}</h2></div>{aside}</div>;
}
