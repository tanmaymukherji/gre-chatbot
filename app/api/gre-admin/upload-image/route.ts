import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { requireAdminUser } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    await requireAdminUser(request);
  } catch {
    return NextResponse.json({ error: "Admin login required." }, { status: 401 });
  }

  try {
    const { base64, filename } = await request.json();
    if (!base64 || typeof base64 !== "string" || !base64.startsWith("data:")) {
      return NextResponse.json({ error: "Invalid image data." }, { status: 400 });
    }

    const match = base64.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) {
      return NextResponse.json({ error: "Invalid base64 format." }, { status: 400 });
    }

    const mimeType = match[1];
    const ext = mimeType.split("/").pop() || "png";
    const safeName = (filename || "image").replace(/[^a-zA-Z0-9_-]/g, "_");
    const blobName = `showcase/${safeName}-${Date.now()}.${ext}`;

    const buffer = Buffer.from(match[2], "base64");
    const blob = await put(blobName, buffer, {
      contentType: mimeType,
      access: "public",
    });

    return NextResponse.json({ url: blob.url });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload failed." },
      { status: 500 }
    );
  }
}
