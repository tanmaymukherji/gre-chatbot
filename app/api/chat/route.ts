import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { formatGroundedResults, generateGroundedAnswer, getHeuristicSearchIntent, interpretSearchIntent, shouldTranslateFirst, shouldUseAiInterpretation } from "@/lib/chat";
import { getFilterOptions, inferSearchFilters, runSearch } from "@/lib/database";

const payloadSchema = z.object({
  message: z.string().min(2),
  filters: z
    .object({
      solutionProvider: z.string().optional(),
      category: z.string().optional(),
      domain6m: z.string().optional(),
      offeringType: z.string().optional(),
      valueChain: z.string().optional(),
      application: z.string().optional(),
      tag: z.string().optional(),
      language: z.string().optional(),
      geography: z.string().optional()
    })
    .default({})
});

export async function POST(request: NextRequest) {
  try {
    const body = payloadSchema.parse(await request.json());
    const normalizedMessage = body.message.toLowerCase();
    const rawWordCount = body.message.trim().split(/\s+/).filter(Boolean).length;
    const shortDirectQuery = rawWordCount <= 4;
    const simpleEnglishKeywordQuery =
      /^[a-z\s]+$/i.test(body.message.trim()) &&
      shortDirectQuery &&
      !/\b(and|or|for|with|near|in|from|available)\b/i.test(normalizedMessage);
    const filterOptions = await getFilterOptions();
    const explicitStructuredCue = Boolean(
      body.filters.solutionProvider ||
      body.filters.category ||
      body.filters.domain6m ||
      body.filters.offeringType ||
      body.filters.valueChain ||
      body.filters.application ||
      body.filters.tag ||
      body.filters.language ||
      body.filters.geography ||
      /\b(training|service|product|knowledge|manual|tech transfer|machine|method|manpower|material|market|money)\b/i.test(normalizedMessage) ||
      /\b(taalim|talim|sikh|seekh|jankari|guide|course)\b/i.test(normalizedMessage) ||
      /(hindi|kannada|odia|oriya|marathi|tamil|telugu)/i.test(normalizedMessage) ||
      /(karnataka|madhya pradesh|odisha|orissa|rajasthan|jharkhand|bihar|uttar pradesh|chhattisgarh)/i.test(normalizedMessage)
    );
    const heuristicIntent = getHeuristicSearchIntent(body.message, filterOptions);
    const requiresTranslationFirst = shouldTranslateFirst(body.message);
    const heuristicResolved = Boolean(
      heuristicIntent.solutionProvider ||
      heuristicIntent.category ||
      heuristicIntent.domain6m ||
      heuristicIntent.offeringType ||
      heuristicIntent.valueChain ||
      heuristicIntent.application ||
      heuristicIntent.tag ||
      heuristicIntent.language ||
      heuristicIntent.geography ||
      (heuristicIntent.keywords || []).length > 0 ||
      (heuristicIntent.englishQuery && heuristicIntent.englishQuery.trim() && heuristicIntent.englishQuery.trim() !== body.message.trim())
    );
    const useAiInterpretation =
      !simpleEnglishKeywordQuery &&
      (
        shouldUseAiInterpretation(body.message) ||
        (requiresTranslationFirst && !heuristicResolved)
      );
    const interpreted = simpleEnglishKeywordQuery && !explicitStructuredCue
      ? {
          englishQuery: body.message.trim(),
          keywords: []
        }
      : useAiInterpretation
        ? await interpretSearchIntent(body.message, filterOptions)
        : heuristicIntent;
    const shouldKeepInterpretedStructure = !shortDirectQuery || explicitStructuredCue || requiresTranslationFirst;
    const interpretedFilters = shouldKeepInterpretedStructure
      ? interpreted
      : {
          englishQuery: interpreted.englishQuery,
          keywords: interpreted.keywords,
          solutionProvider: interpreted.solutionProvider
        };
    const focusedKeyword =
      (interpreted.keywords || []).find((keyword) => !["training", "service", "product", "knowledge"].includes(keyword.toLowerCase())) ||
      "";
    const effectiveFilters = inferSearchFilters(
      {
        ...interpretedFilters,
        ...body.filters
      },
      interpreted.englishQuery || body.message
    );
    const searchQuery = shortDirectQuery
      ? simpleEnglishKeywordQuery
        ? body.message.trim()
        : focusedKeyword || interpreted.englishQuery || body.message
      : [
          interpreted.englishQuery,
          ...(interpreted.keywords || [])
        ]
          .filter(Boolean)
          .join(" ")
          .trim();

    const hasStructuredIntent = Boolean(
      effectiveFilters.solutionProvider ||
      effectiveFilters.valueChain ||
      effectiveFilters.application ||
      effectiveFilters.tag ||
      effectiveFilters.language ||
      effectiveFilters.geography ||
      effectiveFilters.category ||
      effectiveFilters.domain6m ||
      effectiveFilters.offeringType
    );

    const baseSearch = {
      q: searchQuery || interpreted.englishQuery || body.message,
      strictKeyword: shortDirectQuery,
      ...effectiveFilters,
      limit: effectiveFilters.solutionProvider ? 24 : 6
    };

    const attempts = shortDirectQuery
      ? [
          baseSearch,
          { ...baseSearch, strictKeyword: false }
        ]
      : [
          baseSearch,
          { ...baseSearch, application: undefined },
          { ...baseSearch, application: undefined, offeringType: undefined },
          { ...baseSearch, application: undefined, geography: undefined },
          { ...baseSearch, application: undefined, geography: undefined, language: undefined },
          { ...baseSearch, application: undefined, geography: undefined, language: undefined, solutionProvider: undefined, strictKeyword: false }
        ];

    let results: any[] = [];
    let appliedSearch = baseSearch;

    for (const attempt of attempts) {
      results = await runSearch(attempt);
      if (results.length > 0) {
        appliedSearch = attempt;
        break;
      }
    }

    const answer =
      results.length > 0
        ? (simpleEnglishKeywordQuery && !explicitStructuredCue) || !useAiInterpretation
          ? formatGroundedResults(body.message, results)
          : await generateGroundedAnswer(body.message, {
              ...appliedSearch,
              englishQuery: interpreted.englishQuery,
              keywords: interpreted.keywords || []
            }, results)
        : "I could not find a matching solution in the current GRE dataset. Try a different value chain, offering type, 6M domain, geography, or language.";

    return NextResponse.json({
      answer,
      interpreted,
      results
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Chat request failed." },
      { status: 500 }
    );
  }
}
