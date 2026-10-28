import { ImageResponse } from "next/og";
import { recapLine } from "@/lib/recap.ts";
import { loadShare } from "@/lib/share.ts";
import { STATS } from "@/lib/types.ts";

export const alt = "A LayLock slip";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** The link preview: the slip itself, in LayLock's colors. */
export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const slip = await loadShare((await params).id);
  const legs = slip?.legs ?? [];
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", padding: 56, background: "#07090d", color: "#eef3f8", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
          <div style={{ display: "flex", fontSize: 44, fontWeight: 900 }}>
            Lay<span style={{ color: "#2bf59b" }}>Lock</span>
          </div>
          <div style={{ display: "flex", fontSize: 30, color: "#8a96a6" }}>
            {slip?.by ? `@${slip.by}` : slip?.recap ? "Recap" : "Shared slip"} · {legs.length} picks
          </div>
        </div>
        {slip?.recap && <div style={{ display: "flex", fontSize: 46, fontWeight: 900, marginBottom: 20, letterSpacing: -1 }}>{recapLine(legs)}</div>}
        <div style={{ display: "flex", flexDirection: "column", gap: 14, flex: 1 }}>
          {legs.slice(0, slip?.recap ? 5 : 6).map((l, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 20, padding: "14px 22px", background: "#11171f", borderRadius: 18, border: "2px solid #222b37" }}>
              <div
                style={{
                  display: "flex", justifyContent: "center", width: 104, fontSize: 24, fontWeight: 800, padding: "6px 0", borderRadius: 10,
                  background: l.side === "OVER" ? "#163b1e" : "#3d1a1d", color: l.side === "OVER" ? "#2bf59b" : "#ff5d73",
                }}
              >
                {l.side === "OVER" ? "MORE" : "LESS"}
              </div>
              <div style={{ display: "flex", flex: 1, fontSize: 32, fontWeight: 700 }}>
                {l.player} · {l.line} {STATS[l.stat]?.label ?? l.stat}
              </div>
              {slip?.recap ? (
                <div style={{ display: "flex", fontSize: 30, fontWeight: 800, color: l.result === "hit" ? "#2bf59b" : l.result === "miss" ? "#ff5d73" : "#8a96a6" }}>
                  {l.actual !== undefined ? `${l.actual} ` : ""}
                  {l.result === "hit" ? "✓" : l.result === "miss" ? "✗" : "push"}
                </div>
              ) : (
                <div style={{ display: "flex", fontSize: 30, color: "#8a96a6" }}>{Math.round(l.prob * 100)}%</div>
              )}
            </div>
          ))}
          {legs.length > (slip?.recap ? 5 : 6) && <div style={{ display: "flex", fontSize: 26, color: "#8a96a6" }}>+{legs.length - (slip?.recap ? 5 : 6)} more</div>}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 28, color: "#8a96a6", marginTop: 20 }}>
          <span>{slip?.recap ? "Graded from the box scores" : slip?.hit ? `Model: ${(slip.hit * 100).toFixed(1)}% all hit` : "Tap to see the odds"}</span>
          <span style={{ color: "#2bf59b" }}>{slip?.recap ? "Make your picks on LayLock" : "Tail it on LayLock"}</span>
        </div>
      </div>
    ),
    size,
  );
}
