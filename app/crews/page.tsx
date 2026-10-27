import type { Metadata } from "next";
import Crews from "@/components/Crews";

export const metadata: Metadata = { title: "Crews" };

export default function CrewsPage() {
  return <Crews />;
}
