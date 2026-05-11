import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const BLOCKED_IPS = new Set([
  "2405:201:3019:5039:c4fa:2502:a45:39a0"
]);

function getCandidateIps(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for") || "";
  const realIp = request.headers.get("x-real-ip") || "";
  const candidates = [
    ...forwarded.split(","),
    realIp
  ]
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  return [...new Set(candidates)];
}

export function middleware(request: NextRequest) {
  const candidateIps = getCandidateIps(request);
  const isBlocked = candidateIps.some((ip) => BLOCKED_IPS.has(ip));

  if (isBlocked) {
    return new NextResponse("Access denied.", {
      status: 403,
      headers: {
        "cache-control": "no-store"
      }
    });
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)"
  ]
};
