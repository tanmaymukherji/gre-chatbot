import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { generateOfferingAnswer, type ChatMessage } from "@/lib/chat";
import { getOfferingDetail } from "@/lib/database";

const payloadSchema = z.object({
  offeringId: z.string().min(1),
  message: z.string().min(1),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1)
      })
    )
    .default([])
});

export async function POST(request: NextRequest) {
  try {
    const body = payloadSchema.parse(await request.json());
    const offering = await getOfferingDetail(body.offeringId);
    const answer = await generateOfferingAnswer(offering, body.history as ChatMessage[], body.message);

    return NextResponse.json({
      answer
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Offering chat failed." },
      { status: 500 }
    );
  }
}
