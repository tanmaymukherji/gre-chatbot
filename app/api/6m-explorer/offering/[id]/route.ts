import { NextRequest, NextResponse } from "next/server";
import { getOfferingDetail } from "@/lib/database";
import { getMockSolutionsForKeyword, mapSearchResultToSolution } from "@/lib/sixm-explorer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const offering = await getOfferingDetail(id);
    const mapped = mapSearchResultToSolution(offering);

    return NextResponse.json({
      ...mapped,
      sourceSlug: offering?.source_slug || "gre",
      providerWebsite: offering?.solution?.trader?.website || offering?.gre_link || "",
      sixMClassification: offering?.domain_6m || "",
      offeringGroup: offering?.offering_group || "",
      geographyList: Array.isArray(offering?.geographies) ? offering.geographies : [],
      languages: Array.isArray(offering?.languages) ? offering.languages : [],
      contactEmail: offering?.preferred_contact_email || offering?.solution?.trader?.email || "",
      contactPhone: offering?.preferred_contact_phone || offering?.solution?.trader?.mobile || "",
      trainerName: offering?.trainer_name || "",
      summary: offering?.solution?.about_solution_text || offering?.about_offering_text || mapped.description || ""
    });
  } catch {
    const mockMatch = Object.values(["goat", "dairy", "bamboo", "millet", "turmeric"])
      .flatMap((keyword) => getMockSolutionsForKeyword(keyword))
      .find((item) => item.offeringId === id);

    if (!mockMatch) {
      return NextResponse.json({ error: "Solution not found." }, { status: 404 });
    }

    return NextResponse.json({
      ...mockMatch,
      sourceSlug: "mock",
      providerWebsite: mockMatch.greUrl || "",
      sixMClassification: mockMatch.sixMDomains.join(", "),
      offeringGroup: mockMatch.category || "",
      geographyList: mockMatch.geography ? [mockMatch.geography] : [],
      languages: [],
      contactEmail: mockMatch.contact || "",
      contactPhone: "",
      trainerName: "",
      summary: mockMatch.description || ""
    });
  }
}

