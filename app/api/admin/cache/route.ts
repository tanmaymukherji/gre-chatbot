import { NextResponse } from "next/server";
import { invalidateSearchCaches } from "@/lib/database";

export const revalidate = 0;

export async function POST() {
  invalidateSearchCaches();
  return NextResponse.json(
    { ok: true, message: "AskGRE search caches cleared." },
    { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } }
  );
}
