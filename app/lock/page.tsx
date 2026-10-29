import type { Metadata } from "next";
import DailyLock from "@/components/DailyLock";

export const metadata: Metadata = { title: "Daily Lock", description: "One free pick a day. Hit it to keep your streak alive." };

export default function LockPage() {
  return <DailyLock />;
}
