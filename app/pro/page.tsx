import type { Metadata } from "next";
import { Suspense } from "react";
import Pro from "@/components/Pro";

export const metadata: Metadata = { title: "Pro" };

export default function ProPage() {
  return (
    <Suspense>
      <Pro />
    </Suspense>
  );
}
