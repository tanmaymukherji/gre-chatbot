import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";
import {
  applyTranslatedStrings,
  collectTranslatableStrings,
  hashTranslationPayload,
  translateOfferingText
} from "@/lib/offering-translation";
import { getOfferingTranslationLanguage } from "@/lib/offering-translation-languages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TranslationRequest = {
  offeringId?: string;
  language?: string;
  payload?: unknown;
};

async function translateWithConcurrency(values: string[], language: NonNullable<ReturnType<typeof getOfferingTranslationLanguage>>) {
  const translated = new Map<string, string>();
  let failureCount = 0;
  const queue = [...values];
  const workerCount = Math.min(3, queue.length);

  async function worker() {
    while (queue.length) {
      const value = queue.shift();
      if (!value) continue;
      try {
        translated.set(value, await translateOfferingText(value, language));
      } catch {
        failureCount += 1;
        translated.set(value, value);
      }
    }
  }

  await Promise.all(Array.from({ length: workerCount }, worker));
  return { translated, failureCount };
}

export async function POST(request: NextRequest) {
  let body: TranslationRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid translation request." }, { status: 400 });
  }

  const offeringId = String(body.offeringId || "").trim();
  const language = getOfferingTranslationLanguage(String(body.language || "").trim());
  if (!offeringId || !language || !body.payload || typeof body.payload !== "object") {
    return NextResponse.json({ error: "Offering, language, and payload are required." }, { status: 400 });
  }

  const serialized = JSON.stringify(body.payload);
  if (serialized.length > 120000) {
    return NextResponse.json({ error: "Translation payload is too large." }, { status: 413 });
  }

  const sourceHash = hashTranslationPayload(body.payload);
  const supabase = createServerSupabaseClient();

  const { data: cached } = await supabase
    .from("offering_translation_cache")
    .select("translated_payload")
    .eq("offering_id", offeringId)
    .eq("target_language", language.code)
    .eq("source_hash", sourceHash)
    .maybeSingle();

  if (cached?.translated_payload) {
    return NextResponse.json({
      language: language.code,
      sourceHash,
      payload: cached.translated_payload,
      cached: true
    });
  }

  const values = collectTranslatableStrings(body.payload).slice(0, 240);
  const { translated: translatedStrings, failureCount } = await translateWithConcurrency(values, language);
  if (values.length && failureCount === values.length) {
    return NextResponse.json({ error: "Translation service is temporarily unavailable." }, { status: 503 });
  }
  const translatedPayload = applyTranslatedStrings(body.payload, translatedStrings);

  await supabase
    .from("offering_translation_cache")
    .upsert({
      offering_id: offeringId,
      target_language: language.code,
      source_hash: sourceHash,
      translated_payload: translatedPayload,
      provider: "huggingface",
      model: process.env.HF_INDIC_TRANSLATION_MODEL_URL || "ai4bharat/indictrans2-en-indic-dist-200M"
    });

  return NextResponse.json({
    language: language.code,
    sourceHash,
    payload: translatedPayload,
    cached: false
  });
}
