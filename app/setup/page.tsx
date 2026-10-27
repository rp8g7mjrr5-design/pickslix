import type { Metadata } from "next";
import Setup from "@/components/Setup";

export const metadata: Metadata = { title: "Setup check" };

export default function SetupPage() {
  return <Setup />;
}
