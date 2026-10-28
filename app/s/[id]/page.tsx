import type { Metadata } from "next";
import { notFound } from "next/navigation";
import SharedSlipView from "@/components/SharedSlip";
import { loadShare } from "@/lib/share.ts";

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const slip = await loadShare((await params).id);
  if (!slip) return { title: "Shared slip", robots: { index: false } };
  const title = `${slip.by ? `@${slip.by}'s` : "A"} ${slip.legs.length}-pick slip`;
  const description = slip.legs.map((l) => `${l.player} ${l.side === "OVER" ? "more" : "less"} than ${l.line}`).join(" · ");
  return { title, description, robots: { index: false }, openGraph: { title, description }, twitter: { card: "summary_large_image", title, description } };
}

export default async function SharedSlipPage({ params }: Params) {
  const slip = await loadShare((await params).id);
  if (!slip) notFound();
  return <SharedSlipView slip={slip} />;
}
