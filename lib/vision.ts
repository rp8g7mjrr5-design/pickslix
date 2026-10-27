// Reads a Pick 6 screenshot with Claude (needs ANTHROPIC_API_KEY). Without a key the browser falls back
// to on-device OCR (lib/ocr.ts), which is free but less reliable on busy screenshots.
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { STATS, type StatKey } from "./types.ts";
import type { ParsedLine } from "./parseLines.ts";

export const visionEnabled = () => Boolean(process.env.ANTHROPIC_API_KEY);

const statKeys = Object.keys(STATS) as [StatKey, ...StatKey[]];

const Picks = z.object({
  picks: z.array(
    z.object({
      player: z.string(),
      stat: z.enum(statKeys),
      line: z.number(),
      side: z.enum(["MORE", "LESS", "NONE"]),
      teams: z.array(z.string()),
    }),
  ),
});

const PROMPT = `This is a screenshot from the DraftKings Pick 6 app. List every player prop in it.

For each one give:
- player: the name as shown, without the position tag (Pick 6 may shorten it, e.g. "N. Jokic")
- stat: one of ${statKeys.map((k) => `${k} (${STATS[k].label})`).join(", ")}
- line: the number
- side: MORE or LESS if the screenshot shows that this side was picked (a highlighted button, an arrow, "More"/"Less" text on a saved entry); NONE if both buttons are shown unpicked or you can't tell
- teams: team abbreviations shown next to the player (their team first, then opponent), or [] if none

Skip props whose stat isn't in that list. If there are no props, return an empty list.`;

export async function readScreenshot(base64: string, mediaType: "image/jpeg" | "image/png" | "image/webp"): Promise<ParsedLine[]> {
  const client = new Anthropic();
  const response = await client.messages.parse({
    model: "claude-opus-5-5",
    max_tokens: 4000,
    output_config: { effort: "low", format: zodOutputFormat(Picks) },
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
          { type: "text", text: PROMPT },
        ],
      },
    ],
  });
  if (response.stop_reason === "refusal") throw new Error("The screenshot couldn't be read");
  return (response.parsed_output?.picks ?? [])
    .filter((p) => p.player.trim() && Number.isFinite(p.line))
    .map((p) => ({
      sport: STATS[p.stat].sport,
      player: p.player.trim(),
      stat: p.stat,
      line: p.line,
      teams: p.teams,
      side: p.side === "MORE" ? "OVER" : p.side === "LESS" ? "UNDER" : undefined,
    }));
}
