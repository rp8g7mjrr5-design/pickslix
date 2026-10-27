import type { Metadata } from "next";
import JoinCrew from "@/components/JoinCrew";

export const metadata: Metadata = { title: "Join a crew", robots: { index: false } };

export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <JoinCrew code={code} />;
}
