import crypto from "crypto";
import type { OfferingTranslationLanguage } from "@/lib/offering-translation-languages";

const MYMEMORY_LANG_CODES: Record<string, string> = {
  hi: "hi",
  bn: "bn",
  gu: "gu",
  kn: "kn",
  ml: "ml",
  mr: "mr",
  or: "or",
  pa: "pa",
  ta: "ta",
  te: "te",
  ur: "ur"
};

const MYMEMORY_MAX_CHARS = 300;

export function hashTranslationPayload(payload: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function shouldTranslateText(value: string) {
  const text = value.trim();
  if (!text) return false;
  if (/^(https?:\/\/|mailto:|tel:|#)/i.test(text)) return false;
  if (/^[\w.+-]+@[\w.-]+\.[a-z]{2,}$/i.test(text)) return false;
  if (/^[+()\d\s-]{7,}$/.test(text)) return false;
  if (/^(PDF|DOC|EXT|OK)$/i.test(text)) return false;
  return /[A-Za-z]/.test(text);
}

export function collectTranslatableStrings(payload: unknown) {
  const values = new Set<string>();

  function visit(value: unknown) {
    if (typeof value === "string") {
      if (shouldTranslateText(value)) values.add(value);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (value && typeof value === "object") {
      Object.values(value as Record<string, unknown>).forEach(visit);
    }
  }

  visit(payload);
  return [...values];
}

export function applyTranslatedStrings(payload: unknown, translated: Map<string, string>): unknown {
  if (typeof payload === "string") {
    return translated.get(payload) || payload;
  }
  if (Array.isArray(payload)) {
    return payload.map((item) => applyTranslatedStrings(item, translated));
  }
  if (payload && typeof payload === "object") {
    return Object.fromEntries(
      Object.entries(payload as Record<string, unknown>).map(([key, value]) => [
        key,
        applyTranslatedStrings(value, translated)
      ])
    );
  }
  return payload;
}

function splitIntoChunks(text: string, maxLen: number) {
  if (text.length <= maxLen) return [text];
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    if (start + maxLen >= text.length) {
      chunks.push(text.slice(start));
      break;
    }
    let end = start + maxLen;
    const boundary = text.lastIndexOf(" ", end);
    if (boundary > start) end = boundary + 1;
    chunks.push(text.slice(start, end));
    start = end;
  }
  return chunks;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function translateTextWithMyMemory(text: string, targetCode: string) {
  const target = MYMEMORY_LANG_CODES[targetCode];
  if (!target) {
    throw new Error(`MyMemory does not support ${targetCode}.`);
  }

  const translated: string[] = [];
  for (const chunk of splitIntoChunks(text, MYMEMORY_MAX_CHARS)) {
    await delay(160);
    const response = await fetch("https://api.mymemory.translated.net/get", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `q=${encodeURIComponent(chunk)}&langpair=${encodeURIComponent(`en|${target}`)}`
    });
    if (!response.ok) {
      throw new Error(`MyMemory error ${response.status}`);
    }
    const result = await response.json();
    if (result?.responseStatus !== 200) {
      throw new Error(`MyMemory error ${result?.responseStatus || "unknown"}`);
    }
    const value = String(result?.responseData?.translatedText || "").trim();
    if (value) translated.push(value);
  }
  return translated.join(" ");
}

async function translateTextWithIndicModel(text: string, targetLang: string) {
  const token = process.env.HF_INFERENCE_TOKEN;

  const modelUrl =
    process.env.HF_INDIC_TRANSLATION_MODEL_URL ||
    "https://api-inference.huggingface.co/models/ai4bharat/indictrans2-en-indic-dist-200M";

  const response = await fetch(modelUrl, {
    method: "POST",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      inputs: text,
      parameters: {
        src_lang: "eng_Latn",
        tgt_lang: targetLang
      },
      options: {
        wait_for_model: true
      }
    })
  });

  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(`Translation failed: ${response.status} ${message}`);
  }

  const result = await response.json();
  if (Array.isArray(result) && result[0]?.translation_text) {
    return String(result[0].translation_text);
  }
  if (result && typeof result === "object" && "translation_text" in result) {
    return String((result as { translation_text: string }).translation_text);
  }
  if (Array.isArray(result) && typeof result[0]?.generated_text === "string") {
    return String(result[0].generated_text);
  }
  return text;
}

export async function translateOfferingText(text: string, language: OfferingTranslationLanguage) {
  try {
    return await translateTextWithMyMemory(text, language.code);
  } catch {
    return translateTextWithIndicModel(text, language.targetLang);
  }
}
