import type { GreSurfaceConfig } from "@/lib/surface";

export type ProviderEmailTemplateValues = {
  providerName: string;
  providerEmail: string;
  senderName: string;
  senderEmail: string;
  senderPhone?: string;
  solutionTitle: string;
  solutionSummary: string;
  detailUrl: string;
  surfaceHeading: string;
};

export const DEFAULT_PROVIDER_EMAIL_TEMPLATE = [
  "Hello {{providerName}},",
  "",
  "{{senderName}} has reviewed your solution \"{{solutionTitle}}\" on {{surfaceHeading}} and would like to connect with you.",
  "",
  "Solution summary: {{solutionSummary}}",
  "",
  "You can view the solution details here:",
  "{{detailUrl}}",
  "",
  "This email is being sent to {{providerEmail}} and copied to {{senderEmail}}.",
  "",
  "Warm Regards,",
  "Team GRE"
].join("\n");

export const PROVIDER_EMAIL_TEMPLATE_FIELDS = [
  "{{providerName}}",
  "{{providerEmail}}",
  "{{senderName}}",
  "{{senderEmail}}",
  "{{senderPhone}}",
  "{{solutionTitle}}",
  "{{solutionSummary}}",
  "{{detailUrl}}",
  "{{surfaceHeading}}"
] as const;

export function getProviderEmailTemplateDefaults(surface: GreSurfaceConfig["slug"]) {
  return {
    surfaceSlug: surface,
    templateBody: DEFAULT_PROVIDER_EMAIL_TEMPLATE
  };
}

export function renderProviderEmailTemplate(templateBody: string, values: ProviderEmailTemplateValues) {
  return String(templateBody || DEFAULT_PROVIDER_EMAIL_TEMPLATE).replace(/\{\{(\w+)\}\}/g, (match, key) => {
    const value = values[key as keyof ProviderEmailTemplateValues];
    if (value === undefined || value === null || value === "") {
      return match;
    }
    return String(value);
  });
}
