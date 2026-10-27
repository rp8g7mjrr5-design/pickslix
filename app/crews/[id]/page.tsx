import type { Metadata } from "next";
import Crew from "@/components/Crew";

export const metadata: Metadata = { title: "Crew", robots: { index: false } };

export default async function CrewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Crew id={id} />;
}
