import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/auth";
import { applyImportBundle } from "@/lib/database";
import { buildImportBundle } from "@/lib/importer";

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.replace(/^Bearer\s+/i, "") || null;
    await requireAdminUser(token);

    const formData = await request.formData();
    const solutionFile = formData.get("solutionFile");
    const traderFile = formData.get("traderFile");

    if (!(solutionFile instanceof File) || !(traderFile instanceof File)) {
      return NextResponse.json(
        { error: "Both solution and trader Excel files are required." },
        { status: 400 }
      );
    }

    const bundle = await buildImportBundle(await solutionFile.arrayBuffer(), await traderFile.arrayBuffer());
    const summary = await applyImportBundle(bundle, {
      solutionFileName: solutionFile.name,
      traderFileName: traderFile.name
    });

    return NextResponse.json({
      ok: true,
      summary
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Import failed." },
      { status: 500 }
    );
  }
}
