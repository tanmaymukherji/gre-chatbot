import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/auth";

const EDGE_FUNCTION_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/gre-mis-admin`;

export async function POST(request: NextRequest) {
  try {
    await requireAdminUser(request);

    const formData = await request.formData();
    const solutionFile = formData.get("solutionFile");
    const traderFile = formData.get("traderFile");

    if (!(solutionFile instanceof File) || !(traderFile instanceof File)) {
      return NextResponse.json(
        { error: "Both solution and trader Excel files are required." },
        { status: 400 }
      );
    }

    const solutionBase64 = Buffer.from(await solutionFile.arrayBuffer()).toString("base64");
    const traderBase64 = Buffer.from(await traderFile.arrayBuffer()).toString("base64");

    const grameeeAccessToken = request.cookies.get("grameee_access_token")?.value;
    const grameeeUserSummary = request.cookies.get("grameee_user_summary")?.value;

    const response = await fetch(EDGE_FUNCTION_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "uploadChatbotWorkbooks",
        solutionBase64,
        traderBase64,
        solutionFileName: solutionFile.name,
        traderFileName: traderFile.name,
        aiProvider: "gemini",
        grameeeAccessToken,
        grameeeUserSummary,
      }),
    });

    const payload = await response.json();
    if (!response.ok) {
      const fallback = payload.error
        ? `Edge function error: ${payload.error}`
        : "Import via edge function failed. Use the GRE MIS Dashboard directly for this operation.";
      return NextResponse.json({ error: fallback }, { status: 502 });
    }

    return NextResponse.json({
      ok: true,
      summary: payload.summary,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Import failed." },
      { status: 500 }
    );
  }
}
