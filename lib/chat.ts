import OpenAI from "openai";
import { getServerEnv } from "@/lib/env";

type FilterOptions = {
  solutionProviders: string[];
  categories: string[];
  domains6m: string[];
  offeringTypes: string[];
  valueChains: string[];
  applications: string[];
  tags: string[];
  languages: string[];
  geographies: string[];
};

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type ChatResult = {
  offering_name?: string | null;
  offering_group?: string | null;
  offering_type?: string | null;
  domain_6m?: string | null;
  primary_valuechain?: string | null;
  primary_application?: string | null;
  tags?: string[] | null;
  languages?: string[] | null;
  geographies?: string[] | null;
  about_offering_text?: string | null;
  gre_link?: string | null;
  solution?: {
    solution_name?: string | null;
    about_solution_text?: string | null;
    trader?: {
      trader_name?: string | null;
      organisation_name?: string | null;
    } | null;
  } | null;
};

export type SearchIntent = {
  englishQuery: string;
  solutionProvider?: string;
  category?: string;
  domain6m?: string;
  offeringType?: string;
  valueChain?: string;
  application?: string;
  tag?: string;
  language?: string;
  geography?: string;
  keywords?: string[];
};

type TranslatedSearchText = {
  englishQuery: string;
  transliteration?: string;
  keywords: string[];
};

const TRANSLATION_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const translationCache = new Map<string, { expiresAt: number; value: TranslatedSearchText }>();

export function shouldUseAiInterpretation(question: string) {
  const trimmed = question.trim();
  const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
  const hasNonLatinScript = /[^\u0000-\u024f\s]/.test(trimmed);
  const hasQuestionPhrasing =
    /\b(show|find|need|looking|which|what|where|how|recommend|suggest|compare|difference|best|available)\b/i.test(trimmed) ||
    /\?/.test(trimmed);
  const hasConnectorWords =
    /\b(for|with|near|in|from|between|under|around|that|who|which|while)\b/i.test(trimmed);

  if (wordCount <= 4 && !hasQuestionPhrasing) {
    return false;
  }

  if (hasNonLatinScript && wordCount <= 6 && !hasQuestionPhrasing) {
    return false;
  }

  return wordCount > 6 || hasQuestionPhrasing || hasConnectorWords;
}

export function shouldTranslateFirst(question: string) {
  const trimmed = question.trim();
  if (!trimmed) {
    return false;
  }

  const hasNonLatinScript = /[^\u0000-\u024f\s]/.test(trimmed);
  if (hasNonLatinScript) {
    return true;
  }

  return false;
}

function normalizeTranslationKeyword(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildTranslationPrompt(question: string) {
  return [
    "Translate or transliterate the user's search phrase into compact English search text for database retrieval.",
    "Always return a Latin-script transliteration when the input uses a non-English script.",
    "If the phrase could be a local named method, brand, solution title, or proper noun, keep the best search phrase as transliteration rather than replacing it with a literal meaning.",
    "Use literal English meanings as extra keywords, not as the primary search phrase, when the phrase looks like a named technique or title.",
    "Also return 3 to 8 short English synonym or related search keywords that improve recall.",
    "Return JSON only.",
    'Keys: englishQuery, transliteration, keywords.',
    'Example: {"englishQuery":"akkadi saalu","transliteration":"Akkadi Saalu","keywords":["akkadi saalu","intercrop farming","natural farming"]}',
    'Example: {"englishQuery":"maize","transliteration":"jola","keywords":["maize","corn"]}',
    "",
    `Search phrase: ${question}`
  ].join("\n");
}

function buildTransliterationPrompt(question: string) {
  return [
    "Transliterate the user's phrase into Latin script for database search.",
    "Do not explain, and do not translate the meaning unless the phrase is already a common English crop or product name.",
    "Return JSON only.",
    'Keys: transliteration, keywords.',
    'Example: {"transliteration":"Akkadi Saalu","keywords":["akkadi saalu"]}',
    'Example: {"transliteration":"Jola","keywords":["jola"]}',
    "",
    `Search phrase: ${question}`
  ].join("\n");
}

function parseTranslationResponse(text: string | null, originalQuestion: string): TranslatedSearchText | null {
  if (!text) {
    return null;
  }

  const json = extractJsonObject(text);
  if (!json) {
    return null;
  }

  try {
    const parsed = JSON.parse(json);
    const englishQuery = String(parsed.englishQuery || parsed.transliteration || originalQuestion).trim();
    const transliteration = parsed.transliteration ? String(parsed.transliteration).trim() : undefined;
    const keywords = Array.isArray(parsed.keywords)
      ? parsed.keywords.map((keyword: unknown) => normalizeTranslationKeyword(String(keyword || ""))).filter(Boolean).slice(0, 8)
      : [];

    return {
      englishQuery,
      transliteration,
      keywords: [...new Set([normalizeTranslationKeyword(englishQuery), ...keywords])].filter(Boolean)
    };
  } catch {
    return null;
  }
}

function parseTransliterationResponse(text: string | null) {
  if (!text) {
    return null;
  }

  const json = extractJsonObject(text);
  if (!json) {
    return null;
  }

  try {
    const parsed = JSON.parse(json);
    const transliteration = String(parsed.transliteration || "").trim();
    const keywords = Array.isArray(parsed.keywords)
      ? parsed.keywords.map((keyword: unknown) => normalizeTranslationKeyword(String(keyword || ""))).filter(Boolean).slice(0, 8)
      : [];

    if (!transliteration) {
      return null;
    }

    return {
      transliteration,
      keywords: [...new Set([normalizeTranslationKeyword(transliteration), ...keywords])].filter(Boolean)
    };
  } catch {
    return null;
  }
}

async function transliterateSearchText(question: string, env: ReturnType<typeof getServerEnv>) {
  const prompt = buildTransliterationPrompt(question);

  try {
    if (env.openAiApiKey) {
      const response = await generateWithOpenAI(prompt, env.openAiApiKey);
      const parsed = parseTransliterationResponse(response);
      if (parsed) {
        return parsed;
      }
    }
  } catch {
    // fall through
  }

  try {
    if (env.geminiApiKey) {
      const response = await generateWithGemini(prompt, env.geminiApiKey, { jsonMode: true });
      const parsed = parseTransliterationResponse(response);
      if (parsed) {
        return parsed;
      }
    }
  } catch {
    // fall through
  }

  return null;
}

export async function translateSearchText(question: string): Promise<TranslatedSearchText> {
  const cached = translationCache.get(question);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const env = getServerEnv();
  const prompt = buildTranslationPrompt(question);
  const rawWordCount = question.trim().split(/\s+/).filter(Boolean).length;
  const needsScriptAwareTransliteration = /[^\u0000-\u024f\s]/.test(question) && rawWordCount <= 4;

  try {
    if (env.openAiApiKey) {
      const response = await generateWithOpenAI(prompt, env.openAiApiKey);
      const parsed = parseTranslationResponse(response, question);
      if (parsed) {
        if (needsScriptAwareTransliteration && !parsed.transliteration) {
          const transliterationResult = await transliterateSearchText(question, env);
          if (transliterationResult) {
            parsed.transliteration = transliterationResult.transliteration;
            parsed.keywords = [...new Set([...(parsed.keywords || []), ...transliterationResult.keywords])].filter(Boolean);
          }
        }
        translationCache.set(question, {
          expiresAt: Date.now() + TRANSLATION_CACHE_TTL_MS,
          value: parsed
        });
        return parsed;
      }
    }
  } catch {
    // fall through
  }

  try {
    if (env.geminiApiKey) {
      const response = await generateWithGemini(prompt, env.geminiApiKey, { jsonMode: true });
      const parsed = parseTranslationResponse(response, question);
      if (parsed) {
        if (needsScriptAwareTransliteration && !parsed.transliteration) {
          const transliterationResult = await transliterateSearchText(question, env);
          if (transliterationResult) {
            parsed.transliteration = transliterationResult.transliteration;
            parsed.keywords = [...new Set([...(parsed.keywords || []), ...transliterationResult.keywords])].filter(Boolean);
          }
        }
        translationCache.set(question, {
          expiresAt: Date.now() + TRANSLATION_CACHE_TTL_MS,
          value: parsed
        });
        return parsed;
      }
    }
  } catch {
    // fall through
  }

  if (needsScriptAwareTransliteration) {
    const transliterationResult = await transliterateSearchText(question, env);
    if (transliterationResult) {
      const fallback = {
        englishQuery: transliterationResult.transliteration,
        transliteration: transliterationResult.transliteration,
        keywords: transliterationResult.keywords
      };
      translationCache.set(question, {
        expiresAt: Date.now() + TRANSLATION_CACHE_TTL_MS,
        value: fallback
      });
      return fallback;
    }
  }

  const fallback = {
    englishQuery: question,
    keywords: []
  };
  translationCache.set(question, {
    expiresAt: Date.now() + TRANSLATION_CACHE_TTL_MS,
    value: fallback
  });
  return fallback;
}

function buildFallback(results: any[], reason?: string, question?: string) {
  const language = detectLanguageStyle(question || "");
  const lines = results.slice(0, 5).map((result, index) => {
    const trader = result.solution?.trader?.organisation_name || result.solution?.trader?.trader_name || "Unknown provider";
    const chain = result.primary_valuechain || "Unspecified value chain";
    const application = result.primary_application || "Unspecified application";
    const link = result.gre_link ? ` - ${result.gre_link}` : "";
    return `${index + 1}. ${result.offering_name} ${language.byLabel} ${trader} (${result.offering_group || language.offeringLabel}; ${chain}; ${application})${link}`;
  });

  const intro = results.length === 1
    ? `${language.summaryIntro} ${results.length} ${language.matchSuffixSingular}`
    : `${language.summaryIntro} ${results.length} ${language.matchSuffixPlural}`;

  return [
    intro,
    ...lines
  ].join("\n");
}

export function formatGroundedResults(question: string, results: any[]) {
  return buildFallback(results, "direct_search", question);
}

function detectLanguageStyle(text: string) {
  const normalized = text.toLowerCase();
  const romanHindiTokens = [
    "mujhe",
    "mujhko",
    "chahiye",
    "batao",
    "bataye",
    "jankari",
    "sikhaye",
    "kaise",
    "kya",
    "kyun",
    "hai",
    "hain",
    "mein",
    "main",
    "ke",
    "ki",
    "ka",
    "wala",
    "wali",
    "doodh",
    "bakri",
    "palan"
  ];
  const romanHindiScore = romanHindiTokens.filter((token) => normalized.includes(token)).length;

  if (romanHindiScore >= 2 || normalized.includes("hindi")) {
    return {
      name: "Hindi",
      outputStyle: "Hindi written in Roman script",
      summaryIntro: "Maine GRE dataset mein ye matching offerings dhoondi hain.",
      noMatch: "Mujhe is offering ke liye database mein aur jankari nahin mili.",
      matchSuffixSingular: "matching offering mili hai.",
      matchSuffixPlural: "matching offerings mili hain.",
      byLabel: "dwara",
      offeringLabel: "offering"
    };
  }

  if (/[\u0900-\u097f]/.test(text) || normalized.includes("hindi") || normalized.includes("bakri") || normalized.includes("mujhe")) {
    return {
      name: "Hindi",
      outputStyle: "Hindi in Devanagari script",
      summaryIntro: "मुझे GRE dataset में ये matching offerings मिली हैं।",
      noMatch: "मुझे इस offering के लिए database में और जानकारी नहीं मिली।",
      matchSuffixSingular: "matching offering मिली है।",
      matchSuffixPlural: "matching offerings मिली हैं।",
      byLabel: "द्वारा",
      offeringLabel: "offering"
    };
  }

  if (/[\u0c80-\u0cff]/.test(text) || normalized.includes("kannada")) {
    return {
      name: "Kannada",
      outputStyle: "Kannada in Kannada script",
      summaryIntro: "GRE dataset ನಲ್ಲಿ ಈ ಹೊಂದುವ offerings ಸಿಕ್ಕಿವೆ.",
      noMatch: "ಈ offering ಬಗ್ಗೆ database ನಲ್ಲಿ ಹೆಚ್ಚುವರಿ ಮಾಹಿತಿ ಸಿಗಲಿಲ್ಲ.",
      matchSuffixSingular: "offering ಸಿಕ್ಕಿದೆ.",
      matchSuffixPlural: "offerings ಸಿಕ್ಕಿವೆ.",
      byLabel: "ಇವರಿಂದ",
      offeringLabel: "offering"
    };
  }

  if (/[\u0b00-\u0b7f]/.test(text) || normalized.includes("odia") || normalized.includes("oriya")) {
    return {
      name: "Odia",
      outputStyle: "Odia in Odia script",
      summaryIntro: "ମୁଁ GRE dataset ରେ ଏହି ମେଳିଥିବା offerings ପାଇଛି।",
      noMatch: "ଏହି offering ପାଇଁ database ରେ ଅଧିକ ତଥ୍ୟ ମିଳିଲା ନାହିଁ।",
      matchSuffixSingular: "offering ମିଳିଛି।",
      matchSuffixPlural: "offerings ମିଳିଛି।",
      byLabel: "ଦ୍ୱାରା",
      offeringLabel: "offering"
    };
  }

  if (/[\u0b80-\u0bff]/.test(text) || normalized.includes("tamil")) {
    return {
      name: "Tamil",
      outputStyle: "Tamil in Tamil script",
      summaryIntro: "GRE dataset-இல் இந்த பொருந்தும் offerings கிடைத்துள்ளன.",
      noMatch: "இந்த offering குறித்து database-இல் கூடுதல் விவரம் கிடைக்கவில்லை.",
      matchSuffixSingular: "offering கிடைத்துள்ளது.",
      matchSuffixPlural: "offerings கிடைத்துள்ளன.",
      byLabel: "மூலம்",
      offeringLabel: "offering"
    };
  }

  if (/[\u0c00-\u0c7f]/.test(text) || normalized.includes("telugu")) {
    return {
      name: "Telugu",
      outputStyle: "Telugu in Telugu script",
      summaryIntro: "GRE dataset లో ఈ సరిపోయే offerings దొరికాయి.",
      noMatch: "ఈ offering గురించి database లో ఇంకా ఎక్కువ సమాచారం లేదు.",
      matchSuffixSingular: "offering దొరికింది.",
      matchSuffixPlural: "offerings దొరికాయి.",
      byLabel: "వారి నుండి",
      offeringLabel: "offering"
    };
  }

  if (/[\u0a80-\u0aff]/.test(text) || normalized.includes("gujarati")) {
    return {
      name: "Gujarati",
      outputStyle: "Gujarati in Gujarati script",
      summaryIntro: "મેં GRE dataset માં આ મળતી offerings શોધી છે.",
      noMatch: "મને આ offering માટે database માં વધુ માહિતી મળી નથી.",
      matchSuffixSingular: "offering મળી છે.",
      matchSuffixPlural: "offerings મળી છે.",
      byLabel: "દ્વારા",
      offeringLabel: "offering"
    };
  }

  if (/[\u0900-\u097f]/.test(text) || normalized.includes("marathi")) {
    return {
      name: "Marathi",
      outputStyle: "Marathi",
      summaryIntro: "मला GRE dataset मध्ये हे matching offerings सापडले.",
      noMatch: "या offering बद्दल database मध्ये अधिक माहिती सापडली नाही.",
      matchSuffixSingular: "matching offering सापडली आहे.",
      matchSuffixPlural: "matching offerings सापडल्या आहेत.",
      byLabel: "यांच्या कडून",
      offeringLabel: "offering"
    };
  }

  return {
    name: "the same language as the user",
    outputStyle: "the same language and script as the user",
    summaryIntro: "I found these matching offerings in the GRE dataset.",
    noMatch: "I could not find more detail for this offering in the database.",
    matchSuffixSingular: "offering matched.",
    matchSuffixPlural: "offerings matched.",
    byLabel: "by",
    offeringLabel: "Offering"
  };
}

function extractJsonObject(text: string) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return text.slice(start, end + 1);
  }

  return null;
}

function normalizeOption(value: string | undefined, options: string[]) {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  const direct = options.find((option) => option.toLowerCase() === normalized);
  if (direct) {
    return direct;
  }

  const contains = options.find((option) => option.toLowerCase().includes(normalized) || normalized.includes(option.toLowerCase()));
  return contains || undefined;
}

function normalizeLanguage(value: string | undefined, options: string[]) {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  const aliases: Record<string, string> = {
    hindi: "HIN",
    hin: "HIN",
    english: "ENG",
    eng: "ENG",
    kannada: "KANNADA",
    odia: "ODIA",
    oriya: "ODIA",
    marathi: "MARATHI",
    tamil: "TAMIL",
    telugu: "TELGU",
    telgu: "TELGU",
    malayalam: "MALAYALAM",
    bengali: "BENGALI",
    konkani: "KONKANI"
  };

  return normalizeOption(aliases[normalized] || value, options);
}

function normalizeGeography(value: string | undefined, options: string[]) {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  const exact = options.find((option) => option.toLowerCase() === normalized);
  if (exact) {
    return exact;
  }

  const containing = options.find((option) => option.toLowerCase().includes(normalized));
  if (containing) {
    return containing;
  }

  const tokenContaining = options.find((option) =>
    normalized
      .split(/\s+/)
      .filter(Boolean)
      .every((token) => option.toLowerCase().includes(token))
  );

  return tokenContaining || value;
}

function normalizeFreeText(value: string | undefined) {
  return (value || "").toLowerCase().replace(/[^\p{L}\p{N}\s]+/gu, " ").replace(/\s+/g, " ").trim();
}

function findDirectOptionMatch(question: string, options: string[]) {
  const normalizedQuestion = normalizeFreeText(question);

  const matches = options
    .map((option) => {
      const normalizedOption = normalizeFreeText(option);
      if (!normalizedOption) {
        return null;
      }

      if (normalizedQuestion.includes(normalizedOption)) {
        return { option, score: normalizedOption.length + 20 };
      }

      const tokens = normalizedOption.split(/\s+/).filter(Boolean);
      const matchedTokens = tokens.filter((token) => normalizedQuestion.includes(token)).length;
      if (matchedTokens >= Math.max(1, Math.ceil(tokens.length * 0.75))) {
        return { option, score: matchedTokens * 4 };
      }

      return null;
    })
    .filter(Boolean)
    .sort((left: any, right: any) => right.score - left.score);

  return matches[0]?.option;
}

function findDomain6mMatch(question: string, options: string[]) {
  const normalized = normalizeFreeText(question);
  const aliases: Record<string, string[]> = {
    Machine: ["machine", "machinery", "equipment", "tool", "tools"],
    Method: ["method", "methods", "process", "processes", "practice", "practices"],
    Manpower: ["manpower", "skill", "skills", "training", "workforce"],
    Material: ["material", "materials", "input", "inputs", "raw material", "raw materials"],
    Market: ["market", "markets", "marketing", "buyer", "buyers"],
    Money: ["money", "finance", "financial", "loan", "loans", "credit"]
  };

  for (const option of options) {
    const terms = aliases[option] || [option.toLowerCase()];
    if (terms.some((term) => normalized.includes(term))) {
      return option;
    }
  }

  return findDirectOptionMatch(question, options);
}

function findOfferingTypeMatch(question: string, options: string[]) {
  const normalized = normalizeFreeText(question);
  const aliases: Record<string, string[]> = {
    Training: ["training", "course", "learn", "taalim", "talim", "sikh", "seekh", "guide", "workshop"],
    Advisory: ["advisory", "advice", "consulting", "consultation"],
    Workshop: ["workshop", "camp"],
    Service: ["service", "services"],
    Product: ["product", "products", "input", "inputs"],
    Knowledge: ["knowledge", "manual", "content", "information", "jankari"]
  };

  for (const option of options) {
    const terms = aliases[option] || [option.toLowerCase()];
    if (terms.some((term) => normalized.includes(term))) {
      return option;
    }
  }

  return findDirectOptionMatch(question, options);
}

function normalizeIntent(intent: Partial<SearchIntent>, options: FilterOptions): SearchIntent {
  return {
    englishQuery: intent.englishQuery?.trim() || "",
    solutionProvider: normalizeOption(intent.solutionProvider, options.solutionProviders),
    category: normalizeOption(intent.category, options.categories),
    domain6m: normalizeOption(intent.domain6m, options.domains6m),
    offeringType: normalizeOption(intent.offeringType, options.offeringTypes),
    valueChain: normalizeOption(intent.valueChain, options.valueChains),
    application: normalizeOption(intent.application, options.applications),
    tag: normalizeOption(intent.tag, options.tags),
    language: normalizeLanguage(intent.language, options.languages),
    geography: normalizeGeography(intent.geography, options.geographies),
    keywords: (intent.keywords || []).map((keyword) => keyword.trim()).filter(Boolean).slice(0, 8)
  };
}

function buildIntentPrompt(question: string, options: FilterOptions) {
  return [
    "Translate the user's search request into English and map it to GRE search fields.",
    "Return JSON only.",
    "Keys: englishQuery, solutionProvider, category, domain6m, offeringType, valueChain, application, tag, language, geography, keywords.",
    "Use null when unsure.",
    "Geography should be an English place name from the question, not a sentence.",
    "",
    `Allowed solution providers: ${JSON.stringify(options.solutionProviders.slice(0, 80))}`,
    `Allowed categories: ${JSON.stringify(options.categories)}`,
    `Allowed 6M domains: ${JSON.stringify(options.domains6m)}`,
    `Allowed offering types: ${JSON.stringify(options.offeringTypes)}`,
    `Allowed value chains: ${JSON.stringify(options.valueChains)}`,
    `Allowed applications: ${JSON.stringify(options.applications)}`,
    `Allowed tags: ${JSON.stringify(options.tags.slice(0, 120))}`,
    `Allowed languages: ${JSON.stringify(options.languages)}`,
    `Known geographies: ${JSON.stringify(options.geographies.slice(0, 30))}`,
    'Example 1: {"englishQuery":"goat farming training in Hindi in Madhya Pradesh","solutionProvider":null,"category":"Service","domain6m":"Manpower","offeringType":"Training","valueChain":"Livestock","application":"Goat","tag":null,"language":"HIN","geography":"Madhya Pradesh","keywords":["goat","training","hindi","madhya pradesh"]}',
    'Example 2: {"englishQuery":"milk training in Kannada in Karnataka","solutionProvider":null,"category":"Service","domain6m":"Manpower","offeringType":"Training","valueChain":"Dairy","application":"Dairy For Milk","tag":null,"language":"KANNADA","geography":"Karnataka","keywords":["milk","dairy","training","kannada","karnataka"]}',
    'Example 3: {"englishQuery":"show all solutions by Akshaykalpa","solutionProvider":"Akshaykalpa","category":null,"domain6m":null,"offeringType":null,"valueChain":null,"application":null,"tag":null,"language":null,"geography":null,"keywords":["akshaykalpa"]}',
    "",
    `User question: ${question}`
  ].join("\n");
}

function buildHeuristicIntent(question: string, options: FilterOptions) {
  const normalized = question.toLowerCase();
  const intent: Partial<SearchIntent> = {
    keywords: []
  };
  const containsGujaratiScript = /[\u0a80-\u0aff]/.test(question);
  const directAliasMatches = [
    {
      terms: ["\u0C85\u0C95\u0CCD\u0C95\u0CA1\u0CBF \u0CB8\u0CBE\u0CB2\u0CC1"],
      englishQuery: "akkadi saalu",
      tag: "Akkadi Saalu",
      keywords: ["akkadi saalu"]
    },
    {
      terms: ["\u0C9C\u0CCB\u0CB3"],
      englishQuery: "maize",
      keywords: ["maize"]
    }
  ].filter((entry) => entry.terms.some((term) => question.includes(term)));

  const addKeyword = (keyword: string) => {
    if (!intent.keywords?.includes(keyword)) {
      intent.keywords?.push(keyword);
    }
  };

  for (const alias of directAliasMatches) {
    intent.englishQuery = alias.englishQuery;
    if (alias.tag) {
      intent.tag = alias.tag;
    }
    for (const keyword of alias.keywords) {
      addKeyword(keyword);
    }
  }

  if (
    normalized.includes("training") ||
    normalized.includes("sikh") ||
    normalized.includes("jankari") ||
    normalized.includes("guide") ||
    normalized.includes("learn") ||
    question.includes("\u0AA4\u0ABE\u0AB2\u0AC0\u0AAE") ||
    question.includes("\u0AAA\u0ACD\u0AB0\u0AB6\u0ABF\u0A95\u0ACD\u0AB7\u0AA3") ||
    question.includes("\u0AB6\u0AC0\u0A96")
  ) {
    intent.category = "Service";
    intent.domain6m = "Manpower";
    intent.offeringType = "Training";
    addKeyword("training");
  }

  intent.domain6m = intent.domain6m || findDomain6mMatch(question, options.domains6m);
  intent.category = intent.category || findDirectOptionMatch(question, options.categories);
  intent.offeringType = intent.offeringType || findOfferingTypeMatch(question, options.offeringTypes);
  intent.solutionProvider = intent.solutionProvider || findDirectOptionMatch(question, options.solutionProviders);
  intent.valueChain = intent.valueChain || findDirectOptionMatch(question, options.valueChains);
  intent.application = intent.application || findDirectOptionMatch(question, options.applications);
  intent.tag = intent.tag || findDirectOptionMatch(question, options.tags);
  intent.language = intent.language || normalizeLanguage(findDirectOptionMatch(question, options.languages), options.languages);
  intent.geography = intent.geography || normalizeGeography(findDirectOptionMatch(question, options.geographies), options.geographies);

  if (normalized.includes("hindi") || normalized.includes("à¤¹à¤¿à¤‚à¤¦à¥€") || normalized.includes("à¤¹à¤¿à¤¨à¥à¤¦à¥€")) {
    intent.language = "HIN";
    addKeyword("hindi");
  } else if (normalized.includes("kannada")) {
    intent.language = "KANNADA";
    addKeyword("kannada");
  } else if (normalized.includes("odia") || normalized.includes("oriya")) {
    intent.language = "ODIA";
    addKeyword("odia");
  } else if (normalized.includes("marathi")) {
    intent.language = "MARATHI";
    addKeyword("marathi");
  }

  if (normalized.includes("karnataka")) {
    intent.geography = "Karnataka";
    addKeyword("karnataka");
  } else if (normalized.includes("madhya pradesh") || /\bmp\b/.test(normalized)) {
    intent.geography = "Madhya Pradesh";
    addKeyword("madhya pradesh");
  } else if (normalized.includes("odisha") || normalized.includes("orissa")) {
    intent.geography = "Odisha";
    addKeyword("odisha");
  }

  if (normalized.includes("doodh") || normalized.includes("milk") || normalized.includes("dairy")) {
    intent.valueChain = "Dairy";
    intent.application = "Dairy For Milk";
    addKeyword("milk");
    addKeyword("dairy");
  }

  if (normalized.includes("bakri") || normalized.includes("bakra") || normalized.includes("goat")) {
    intent.valueChain = "Livestock";
    intent.application = "Goat";
    addKeyword("goat");
  }

  if (
    normalized.includes("maize") ||
    normalized.includes("corn") ||
    normalized.includes("jowar") ||
    question.includes("\u0C9C\u0CCB\u0CB3")
  ) {
    addKeyword("maize");
  }

  if (
    normalized.includes("biscuit") ||
    normalized.includes("biscuits") ||
    question.includes("\u0AAC\u0ABF\u0AB8\u0ACD\u0A95\u0AC0\u0A9F") ||
    question.includes("\u0AAC\u0ABF\u0AB8\u0ACD\u0A95\u0ABF\u0A9F")
  ) {
    intent.valueChain = intent.valueChain || "Bakery";
    intent.application = intent.application || "Biscuits";
    addKeyword("biscuit");
    addKeyword("biscuits");
  }

  const inferredProvider = options.solutionProviders.find((provider) =>
    normalized.includes(provider.toLowerCase())
  );
  if (inferredProvider) {
    intent.solutionProvider = inferredProvider;
    addKeyword(inferredProvider.toLowerCase());
  }

  if (intent.tag) {
    addKeyword(intent.tag.toLowerCase());
  }
  if (intent.valueChain) {
    addKeyword(intent.valueChain.toLowerCase());
  }
  if (intent.application) {
    addKeyword(intent.application.toLowerCase());
  }

  const englishParts = [
    intent.application === "Biscuits" ? "biscuit" : null,
    intent.application === "Goat" ? "goat farming" : null,
    intent.application === "Dairy For Milk" ? "milk dairy" : null,
    intent.application === "Maize" ? "maize" : null,
    intent.offeringType === "Training" ? "training" : null,
    intent.domain6m?.toLowerCase() || null,
    intent.valueChain?.toLowerCase() || null,
    intent.application?.toLowerCase() || null,
    intent.tag?.toLowerCase() || null,
    intent.language ? normalizeLanguage(intent.language, options.languages)?.toLowerCase() : null,
    intent.geography?.toLowerCase() || null
  ].filter(Boolean);

  intent.englishQuery =
    intent.englishQuery ||
    englishParts.join(" ").trim() ||
    (containsGujaratiScript ? "training" : question);

  return normalizeIntent(intent, options);
}

export function getHeuristicSearchIntent(question: string, options: FilterOptions) {
  return buildHeuristicIntent(question, options);
}

function mergeIntent(primary: SearchIntent, fallback: SearchIntent): SearchIntent {
  const fallbackKeywords = new Set(fallback.keywords || []);
  const preferSpecificFallbackTopic = fallbackKeywords.has("biscuit") || fallbackKeywords.has("biscuits");

  return {
    englishQuery: primary.englishQuery || fallback.englishQuery,
    solutionProvider: primary.solutionProvider || fallback.solutionProvider,
    category: primary.category || fallback.category,
    domain6m: primary.domain6m || fallback.domain6m,
    offeringType: primary.offeringType || fallback.offeringType,
    valueChain:
      preferSpecificFallbackTopic && fallback.valueChain
        ? fallback.valueChain
        : primary.valueChain || fallback.valueChain,
    application:
      preferSpecificFallbackTopic && fallback.application
        ? fallback.application
        : primary.application || fallback.application,
    tag: primary.tag || fallback.tag,
    language: primary.language || fallback.language,
    geography: primary.geography || fallback.geography,
    keywords: [...new Set([...(primary.keywords || []), ...(fallback.keywords || [])])].slice(0, 8)
  };
}

export function mergeSearchIntents(primary: SearchIntent, fallback: SearchIntent) {
  return mergeIntent(primary, fallback);
}

function compactResults(results: ChatResult[]) {
  return results.slice(0, 8).map((result, index) => ({
    rank: index + 1,
    offeringName: result.offering_name || null,
    provider:
      result.solution?.trader?.organisation_name ||
      result.solution?.trader?.trader_name ||
      null,
    offeringGroup: result.offering_group || null,
    offeringType: result.offering_type || null,
    domain6M: result.domain_6m || null,
    valueChain: result.primary_valuechain || null,
    application: result.primary_application || null,
    tags: (result.tags || []).slice(0, 8),
    languages: (result.languages || []).slice(0, 5),
    geographies: (result.geographies || []).slice(0, 5),
    offeringSummary: result.about_offering_text?.slice(0, 500) || null,
    solutionName: result.solution?.solution_name || null,
    solutionSummary: result.solution?.about_solution_text?.slice(0, 500) || null,
    greLink: result.gre_link || null
  }));
}

function buildPrompt(question: string, filters: Record<string, unknown>, results: any[]) {
  const language = detectLanguageStyle(question);
  return [
    "You are a grounded assistant for the Green Rural Economy solutions directory.",
    "Answer only from the supplied search results.",
    "If the results are limited, say so plainly.",
    "Prefer concise paragraphs and a short list of matches.",
    "For each recommended match, include offering name, provider, category or 6M domain when useful, and the GRE link if present.",
    `Respond in ${language.outputStyle}. Do not switch to English unless the user asked in English.`,
    "",
    `User question: ${question}`,
    `Applied filters: ${JSON.stringify(filters)}`,
    `Search results: ${JSON.stringify(compactResults(results))}`
  ].join("\n");
}

function compactOffering(offering: any) {
  return {
    offeringId: offering.offering_id || null,
    offeringName: offering.offering_name || null,
    offeringCategory: offering.offering_category || null,
    offeringGroup: offering.offering_group || null,
    offeringType: offering.offering_type || null,
    domain6M: offering.domain_6m || null,
    primaryValueChain: offering.primary_valuechain || null,
    primaryApplication: offering.primary_application || null,
    valueChains: offering.valuechains || [],
    applications: offering.applications || [],
    tags: offering.tags || [],
    languages: offering.languages || [],
    geographies: offering.geographies || [],
    aboutOffering: offering.about_offering_text || null,
    audience: offering.audience || null,
    trainerName: offering.trainer_name || null,
    trainerEmail: offering.trainer_email || null,
    trainerPhone: offering.trainer_phone || null,
    trainerDetails: offering.trainer_details_text || null,
    duration: offering.duration || null,
    prerequisites: offering.prerequisites || null,
    serviceCost: offering.service_cost || null,
    supportPostService: offering.support_post_service || null,
    supportPostServiceCost: offering.support_post_service_cost || null,
    deliveryMode: offering.delivery_mode || null,
    certificationOffered: offering.certification_offered || null,
    costRemarks: offering.cost_remarks || null,
    locationAvailability: offering.location_availability || null,
    serviceBrochureUrl: offering.service_brochure_url || null,
    gradeCapacity: offering.grade_capacity || null,
    productCost: offering.product_cost || null,
    leadTime: offering.lead_time || null,
    supportDetails: offering.support_details || null,
    productBrochureUrl: offering.product_brochure_url || null,
    knowledgeContentUrl: offering.knowledge_content_url || null,
    contactDetails: offering.contact_details || null,
    greLink: offering.gre_link || null,
    solution: {
      solutionName: offering.solution?.solution_name || null,
      aboutSolution: offering.solution?.about_solution_text || null,
      provider: offering.solution?.trader?.organisation_name || offering.solution?.trader?.trader_name || null,
      providerEmail: offering.solution?.trader?.email || null,
      providerWebsite: offering.solution?.trader?.website || null,
      providerStatus: offering.solution?.trader?.association_status || null
    }
  };
}

function buildOfferingPrompt(offering: any, history: ChatMessage[], question: string) {
  const language = detectLanguageStyle(question);
  const turns = history
    .slice(-10)
    .map((message) => `${message.role === "user" ? "User" : "Assistant"}: ${message.content}`)
    .join("\n");

  return [
    "You are a grounded assistant for one specific Green Rural Economy offering.",
    "Answer only from the offering record provided below.",
    "If something is not in the record, say that clearly and do not invent details.",
    `Respond in ${language.outputStyle}. Do not switch to English unless the user asked in English.`,
    "If the user writes Hindi in Roman script, answer in Hindi written in Roman script.",
    "Use the conversation history to continue the discussion naturally.",
    "",
    `Conversation history:\n${turns || "User: " + question}`,
    "",
    `Current user question: ${question}`,
    `Offering record: ${JSON.stringify(compactOffering(offering))}`
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

async function generateWithGemini(prompt: string, apiKey: string, options?: { jsonMode?: boolean }) {
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
        ],
        generationConfig: options?.jsonMode
          ? {
              responseMimeType: "application/json"
            }
          : undefined
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

export async function interpretSearchIntent(question: string, options: FilterOptions) {
  const env = getServerEnv();
  const prompt = buildIntentPrompt(question, options);
  const heuristic = buildHeuristicIntent(question, options);

  const tryParse = (text: string | null) => {
    if (!text) {
      return null;
    }

    const json = extractJsonObject(text);
    if (!json) {
      return null;
    }

    try {
      return mergeIntent(normalizeIntent(JSON.parse(json), options), heuristic);
    } catch {
      return null;
    }
  };

  try {
    if (env.openAiApiKey) {
      const response = await generateWithOpenAI(prompt, env.openAiApiKey);
      const parsed = tryParse(response);
      if (parsed) {
        return parsed;
      }
    }
  } catch {
    // fall through to Gemini
  }

  try {
    if (env.geminiApiKey) {
      const response = await generateWithGemini(prompt, env.geminiApiKey, { jsonMode: true });
      const parsed = tryParse(response);
      if (parsed) {
        return parsed;
      }
    }
  } catch {
    // fall through to heuristic fallback
  }

  return heuristic;
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
      return buildFallback(results, "openai_error", question);
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
    return buildFallback(results, "gemini_error", question);
  }

  return buildFallback(results, "no_ai_provider", question);
}

export async function generateOfferingAnswer(offering: any, history: ChatMessage[], question: string) {
  const env = getServerEnv();
  const prompt = buildOfferingPrompt(offering, history, question);
  const language = detectLanguageStyle(question);

  try {
    if (env.openAiApiKey) {
      const response = await generateWithOpenAI(prompt, env.openAiApiKey);
      if (response) {
        return response;
      }
    }
  } catch {
    // fall through
  }

  try {
    if (env.geminiApiKey) {
      const response = await generateWithGemini(prompt, env.geminiApiKey);
      if (response) {
        return response;
      }
    }
  } catch {
    // fall through
  }

  const provider =
    offering.solution?.trader?.organisation_name ||
    offering.solution?.trader?.trader_name ||
    "Unknown provider";

  return [
    language.noMatch,
    `${offering.offering_name || "Untitled offering"} - ${provider}`,
    offering.about_offering_text || offering.solution?.about_solution_text || "",
    offering.gre_link || ""
  ]
    .filter(Boolean)
    .join("\n");
}

