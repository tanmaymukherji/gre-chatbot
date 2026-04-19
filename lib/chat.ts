import OpenAI from "openai";
import { getServerEnv } from "@/lib/env";

function buildFallback(results: any[], reason?: string) {
  const lines = results.slice(0, 5).map((result, index) => {
    const trader = result.solution?.trader?.organisation_name || result.solution?.trader?.trader_name || "Unknown provider";
    const chain = result.primary_valuechain || "Unspecified value chain";
    const application = result.primary_application || "Unspecified application";
    const link = result.gre_link ? ` - ${result.gre_link}` : "";
    return `${index + 1}. ${result.offering_name} by ${trader} (${result.offering_group || "Offering"}; ${chain}; ${application})${link}`;
  });

  const intro = reason
    ? `The AI summary is temporarily unavailable, so here are direct matches from the GRE dataset.`
    : `I found ${results.length} matching offerings in the GRE dataset.`;

  return [
    intro,
    ...lines
  ].join("\n");
}

function buildPrompt(question: string, filters: Record<string, unknown>, results: any[]) {
  return [
    "You are a grounded assistant for the Green Rural Economy solutions directory.",
    "Answer only from the supplied search results.",
    "If the results are limited, say so plainly.",
    "Prefer concise paragraphs and a short list of matches.",
    "For each recommended match, include offering name, provider, category or 6M domain when useful, and the GRE link if present.",
    "",
    `User question: ${question}`,
    `Applied filters: ${JSON.stringify(filters)}`,
    `Search results: ${JSON.stringify(results)}`
  ].join("\n");
}

async function generateWithOpenAI(prompt: string, apiKey: string) {
  const client = new OpenAI({ apiKey });
  const response = await client.responses.create({
    model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
    input: prompt
  });

  return response.output_text || null;
}

async function generateWithGemini(prompt: string, apiKey: string) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${process.env.GEMINI_MODEL || "gemini-2.5-flash"}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }]
          }
        ]
      })
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Gemini request failed with status ${response.status}`);
  }

  const data = await response.json();
  return data?.candidates?.[0]?.content?.parts?.map((part: any) => part.text || "").join("").trim() || null;
}

export async function generateGroundedAnswer(question: string, filters: Record<string, unknown>, results: any[]) {
  const env = getServerEnv();
  const prompt = buildPrompt(question, filters, results);

  try {
    if (env.openAiApiKey) {
      const response = await generateWithOpenAI(prompt, env.openAiApiKey);
      if (response) {
        return response;
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const quotaLikeError =
      message.includes("429") ||
      message.toLowerCase().includes("quota") ||
      message.toLowerCase().includes("rate limit") ||
      message.toLowerCase().includes("billing");
    if (!quotaLikeError && !env.geminiApiKey) {
      return buildFallback(results, "openai_error");
    }
  }

  try {
    if (env.geminiApiKey) {
      const geminiResponse = await generateWithGemini(prompt, env.geminiApiKey);
      if (geminiResponse) {
        return geminiResponse;
      }
    }
  } catch {
    return buildFallback(results, "gemini_error");
  }

  return buildFallback(results, "no_ai_provider");
}
