import type { Metadata } from "next";
import Accuracy from "@/components/Accuracy";

export const metadata: Metadata = {
  title: "Model accuracy",
  description: "How often LayLock's picks actually hit, graded from box scores, compared with the chance the model gave them.",
};

export default function Page() {
  return <Accuracy />;
}
