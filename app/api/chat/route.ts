import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { generateGroundedAnswer } from "@/lib/chat";
import { runSearch } from "@/lib/database";

const payloadSchema = z.object({
  message: z.string().min(2),
  filters: z
    .object({
      category: z.string().optional(),
      domain6m: z.string().optional(),
      offeringType: z.string().optional(),
      valueChain: z.string().optional(),
      application: z.string().optional(),
      language: z.string().optional(),
      geography: z.string().optional()
    })
    .default({})
});

export async function POST(request: NextRequest) {
  try {
    const body = payloadSchema.parse(await request.json());
    const results = await runSearch({
      q: body.message,
      ...body.filters,
      limit: 8
    });

    const answer =
      results.length > 0
        ? await generateGroundedAnswer(body.message, body.filters, results)
        : "I could not find a matching solution in the current GRE dataset. Try a different value chain, offering type, 6M domain, geography, or language.";

    return NextResponse.json({
      answer,
      results
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Chat request failed." },
      { status: 500 }
    );
  }
}
