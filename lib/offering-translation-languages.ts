export type OfferingTranslationLanguage = {
  code: string;
  label: string;
  targetLang: string;
};

export const OFFERING_TRANSLATION_LANGUAGES: OfferingTranslationLanguage[] = [
  { code: "hi", label: "Hindi", targetLang: "hin_Deva" },
  { code: "bn", label: "Bengali", targetLang: "ben_Beng" },
  { code: "gu", label: "Gujarati", targetLang: "guj_Gujr" },
  { code: "kn", label: "Kannada", targetLang: "kan_Knda" },
  { code: "ml", label: "Malayalam", targetLang: "mal_Mlym" },
  { code: "mr", label: "Marathi", targetLang: "mar_Deva" },
  { code: "or", label: "Odia", targetLang: "ory_Orya" },
  { code: "pa", label: "Punjabi", targetLang: "pan_Guru" },
  { code: "ta", label: "Tamil", targetLang: "tam_Taml" },
  { code: "te", label: "Telugu", targetLang: "tel_Telu" },
  { code: "ur", label: "Urdu", targetLang: "urd_Arab" },
  { code: "as", label: "Assamese", targetLang: "asm_Beng" }
];

export function getOfferingTranslationLanguage(code: string) {
  return OFFERING_TRANSLATION_LANGUAGES.find((language) => language.code === code);
}
