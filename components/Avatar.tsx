"use client";
// A player's face: their headshot when we have one, otherwise their initials on a color picked from their team,
// so the same team always gets the same color.
import { useState } from "react";

export const initials = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
};

/** A stable hue for a team (or a name, when the team isn't known). */
export const hueFor = (key: string) => {
  let h = 0;
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
};

export default function Avatar({ name, team, color, src, size = 40, className = "" }: { name: string; team?: string; color?: string; src?: string; size?: number; className?: string }) {
  const [broken, setBroken] = useState(false);
  const style = {
    width: size,
    height: size,
    "--h": hueFor(team || name),
    ...(color ? { "--c": color.startsWith("#") ? color : `#${color}` } : {}),
    fontSize: Math.round(size * 0.36),
  } as React.CSSProperties;
  if (src && !broken)
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" className={`avatar2 photo ${className}`} style={style} loading="lazy" onError={() => setBroken(true)} />;
  return (
    <span className={`avatar2 ${color ? "teamc" : ""} ${className}`} style={style} aria-hidden>
      {initials(name)}
    </span>
  );
}
