import OpenAI from "openai";
import { getServerEnv } from "@/lib/env";

function buildFallback(results: any[]) {
  const lines = results.slice(0, 5).map((result, index) => {
    const trader = result.solution?.trader?.organisation_name || result.solution?.trader?.trader_name || "Unknown provider";
    const chain = result.primary_valuechain || "Unspecified value chain";
    const application = result.primary_application || "Unspecified application";
    return `${index + 1}. ${result.offering_name} by ${trader} (${result.offering_group || "Offering"}; ${chain}; ${application})`;
  });

  return [
    `I found ${results.length} matching offerings in the GRE dataset.`,
    ...lines
  ].join("\n");
}

export async function generateGroundedAnswer(question: string, filters: Record<string, unknown>, results: any[]) {
  const env = getServerEnv();
  if (!env.openAiApiKey) {
    return buildFallback(results);
  }

  const client = new OpenAI({ apiKey: env.openAiApiKey });

  const prompt = [
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

  const response = await client.responses.create({
    model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
    input: prompt
  });

  return response.output_text || buildFallback(results);
}
