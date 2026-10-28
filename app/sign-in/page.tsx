import type { Metadata } from "next";
import { Suspense } from "react";
import SignInPage from "@/components/SignInPage";

export const metadata: Metadata = { title: "Sign in" };

export default function Page() {
  return (
    <Suspense>
      <SignInPage />
    </Suspense>
  );
}
