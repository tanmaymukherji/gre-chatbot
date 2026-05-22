import { NextRequest, NextResponse } from "next/server";
import { invalidateSearchCaches, refreshSurfaceCaches } from "@/lib/database";

export const revalidate = 0;

export async function POST(request: NextRequest) {
  invalidateSearchCaches();
  const payload = await request.json().catch(() => ({}));
  const surface = payload?.surface === "askgre" || payload?.surface === "supergre" ? payload.surface : "all";
  const refresh = payload?.refresh !== false;
  const refreshed = refresh ? await refreshSurfaceCaches(surface) : null;
  return NextResponse.json(
    { ok: true, message: "Search caches cleared.", refreshed },
    { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } }
  );
}
