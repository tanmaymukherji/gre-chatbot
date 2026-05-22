"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

type DetailBackButtonProps = {
  className?: string;
};

export function DetailBackButton({ className }: DetailBackButtonProps) {
  const router = useRouter();

  useEffect(() => {
    router.prefetch("/");
  }, [router]);

  return (
    <button
      className={className}
      type="button"
      onClick={() => {
        if (typeof window !== "undefined" && window.history.length > 1) {
          router.back();
          return;
        }
        router.push("/");
      }}
    >
      Back to Search
    </button>
  );
}
