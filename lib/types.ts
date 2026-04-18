export type SearchFilters = {
  q?: string;
  category?: string;
  domain6m?: string;
  offeringType?: string;
  valueChain?: string;
  application?: string;
  language?: string;
  geography?: string;
  limit?: number;
};

export type TraderRecord = {
  trader_id: string;
  trader_name: string | null;
  organisation_name: string | null;
  mobile: string | null;
  email: string | null;
  poc_name: string | null;
  tenant_id: string | null;
  profile_id: string | null;
  description: string | null;
  short_description: string | null;
  tagline: string | null;
  website: string | null;
  created_at_source: string | null;
  association_status: string | null;
  raw_payload: Record<string, unknown>;
};

export type SolutionRecord = {
  solution_id: string;
  trader_id: string | null;
  solution_name: string | null;
  solution_status: string | null;
  publish_status: string | null;
  created_at_source: string | null;
  about_solution_html: string | null;
  about_solution_text: string | null;
  solution_image_url: string | null;
  raw_payload: Record<string, unknown>;
};

export type OfferingRecord = {
  offering_id: string;
  solution_id: string | null;
  trader_id: string | null;
  offering_name: string | null;
  publish_status: string | null;
  created_at_source: string | null;
  offering_category: string | null;
  offering_group: string | null;
  offering_type: string | null;
  domain_6m: string | null;
  primary_valuechain_id: string | null;
  primary_valuechain: string | null;
  primary_application_id: string | null;
  primary_application: string | null;
  valuechains: string[];
  applications: string[];
  tags: string[];
  languages: string[];
  geographies: string[];
  geographies_raw: string | null;
  about_offering_html: string | null;
  about_offering_text: string | null;
  audience: string | null;
  trainer_name: string | null;
  trainer_email: string | null;
  trainer_phone: string | null;
  trainer_details_html: string | null;
  trainer_details_text: string | null;
  duration: string | null;
  prerequisites: string | null;
  service_cost: string | null;
  support_post_service: string | null;
  support_post_service_cost: string | null;
  delivery_mode: string | null;
  certification_offered: string | null;
  cost_remarks: string | null;
  location_availability: string | null;
  service_brochure_url: string | null;
  grade_capacity: string | null;
  product_cost: string | null;
  lead_time: string | null;
  support_details: string | null;
  product_brochure_url: string | null;
  knowledge_content_url: string | null;
  contact_details: string | null;
  gre_link: string | null;
  search_document: string;
  raw_payload: Record<string, unknown>;
};

export type ImportBundle = {
  traders: TraderRecord[];
  solutions: SolutionRecord[];
  offerings: OfferingRecord[];
  stats: {
    solutionRows: number;
    traderRows: number;
  };
};
