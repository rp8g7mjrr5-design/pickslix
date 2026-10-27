import { NextResponse } from "next/server";
import { resolveLines } from "@/lib/resolveLines.ts";
import { readScreenshot, visionEnabled } from "@/lib/vision.ts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

/** GET tells the page whether screenshots are read here (Claude) or in the browser (on-device OCR). */
export async function GET() {
  return NextResponse.json({ mode: visionEnabled() ? "server" : "device" });
}

export async function POST(req: Request) {
  if (!visionEnabled()) return NextResponse.json({ error: "Screenshot reading isn't set up on the server" }, { status: 501 });
  const { image } = (await req.json().catch(() => ({}))) as { image?: string };
  const m = /^data:(image\/[a-z]+);base64,(.+)$/.exec(image ?? "");
  const type = TYPES.find((t) => t === m?.[1]);
  if (!m || !type) return NextResponse.json({ error: "Send a PNG, JPEG or WebP image" }, { status: 400 });
  if (m[2].length > 6_000_000) return NextResponse.json({ error: "Image is too large" }, { status: 413 });
  try {
    const lines = await readScreenshot(m[2], type);
    return NextResponse.json(await resolveLines(lines));
  } catch (e) {
    console.error("screenshot read failed", e);
    return NextResponse.json({ error: "Couldn't read that screenshot. Try again or paste the lines." }, { status: 502 });
  }
}
