export async function translateToEnglish(
  text: string,
  detectedLang: string
): Promise<{ translated: string; detectedLang: string }> {
  const cleaned = text.trim();
  if (!cleaned) {
    return { translated: cleaned, detectedLang: "en" };
  }

  const isAscii = /^[\x00-\x7F\s.,!?\-:;'"()]+$/.test(cleaned);
  if (isAscii) {
    return { translated: cleaned, detectedLang: "en" };
  }

  let srcLang = detectedLang;
  if (!srcLang || srcLang === "en") {
    if (/[\u0900-\u097F]/.test(cleaned)) {
      srcLang = "hin_Deva";
    } else if (/[\u0B00-\u0B7F]/.test(cleaned)) {
      srcLang = "ory";
    } else if (/[\u0C00-\u0C7F]/.test(cleaned)) {
      srcLang = "tel";
    } else if (/[\u0B80-\u0BFF]/.test(cleaned)) {
      srcLang = "tam";
    } else if (/[\u0C80-\u0CFF]/.test(cleaned)) {
      srcLang = "kan";
    } else if (/[\u0A80-\u0AFF]/.test(cleaned)) {
      srcLang = "guj";
    } else if (/[\u0960-\u097F]/.test(cleaned)) {
      srcLang = "hin_Deva";
    } else {
      srcLang = "hin_Deva";
    }
  }

  const HF_TOKEN = process.env.HF_INFERENCE_TOKEN;
  const MODEL_URL =
    "https://api-inference.huggingface.com/models/ai4bharat/indictrans2-enabling-verbatim-translation";

  let translatedText = cleaned;

  try {
    const response = await fetch(MODEL_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${HF_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        inputs: cleaned,
        parameters: {
          src_lang: srcLang,
          tgt_lang: "eng_Latn",
        },
      }),
    });

    if (response.ok) {
      const result = await response.json();
      if (result && Array.isArray(result) && result[0]?.translation_text) {
        translatedText = result[0].translation_text;
      } else if (result && typeof result === "object" && "translation_text" in result) {
        translatedText = (result as { translation_text: string }).translation_text;
      }
    }
  } catch {
    // Translation failed — fall back to original text
    translatedText = cleaned;
  }

  return { translated: translatedText, detectedLang: srcLang };
}

export function detectLanguage(text: string): string {
  if (/[\u0900-\u097F]/.test(text)) return "Hindi";
  if (/[\u0B00-\u0B7F]/.test(text)) return "Odia";
  if (/[\u0C00-\u0C7F]/.test(text)) return "Telugu";
  if (/[\u0B80-\u0BFF]/.test(text)) return "Tamil";
  if (/[\u0C80-\u0CFF]/.test(text)) return "Kannada";
  if (/[\u0A80-\u0AFF]/.test(text)) return "Gujarati";
  if (/[\u0960-\u097F]/.test(text)) return "Hindi";
  return "en";
}