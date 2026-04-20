import { NextResponse } from "next/server";
import { getServerEnv } from "@/lib/env";

export async function GET() {
  const env = getServerEnv();

  return NextResponse.json({
    mapplsPublicKey: env.mapplsPublicKey || null
  });
}
