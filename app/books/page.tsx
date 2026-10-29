import type { Metadata } from "next";
import Sportsbook from "@/components/Sportsbook";

export const metadata: Metadata = {
  title: "Sportsbook",
  description: "Moneylines, spreads, totals and player props across the books, with fair odds, the best price and a parlay pricer.",
};

export default function BooksPage() {
  return <Sportsbook />;
}
