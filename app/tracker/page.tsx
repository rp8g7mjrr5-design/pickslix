import type { Metadata } from "next";
import Bets from "@/components/Bets";
import Tracker from "@/components/Tracker";

export const metadata: Metadata = { title: "Tracker" };

export default function TrackerPage() {
  return (
    <>
      <Tracker />
      <div className="tracker betswrap">
        <Bets />
      </div>
    </>
  );
}
