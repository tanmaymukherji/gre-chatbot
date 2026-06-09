export const SIX_M_DOMAINS = ["Manpower", "Method", "Material", "Machine", "Money", "Market"] as const;

export type SixMDomain = (typeof SIX_M_DOMAINS)[number];

export type Solution = {
  id: string;
  offeringId: string;
  title: string;
  providerName: string;
  description?: string;
  sixMDomains: SixMDomain[];
  category?: string;
  offeringType?: string;
  valueChains?: string[];
  applications?: string[];
  geography?: string;
  thumbnailUrl?: string;
  greUrl?: string;
  contact?: string;
  tags?: string[];
  sourceLabel?: string;
  detailHref?: string;
  locationLabel?: string;
};

function buildSolution(
  keyword: string,
  domain: SixMDomain,
  slug: string,
  title: string,
  providerName: string,
  extra: Partial<Solution> = {}
): Solution {
  return {
    id: `mock-${slug}`,
    offeringId: `mock-${slug}`,
    title,
    providerName,
    description: `${title} supports ${keyword} enterprises through the ${domain.toLowerCase()} lens.`,
    sixMDomains: [domain],
    category: "Product",
    offeringType: "Mock",
    valueChains: [keyword],
    applications: [keyword],
    geography: "India",
    contact: "hello@example.org",
    greUrl: "#",
    detailHref: "#",
    sourceLabel: "Mock GRE Dataset",
    ...extra
  };
}

export const MOCK_SOLUTIONS: Record<string, Solution[]> = {
  goat: [
    buildSolution("goat", "Manpower", "goat-manpower-1", "Goat Farmer Training Cohort", "Gram Skills Lab", {
      category: "Service",
      offeringType: "Training",
      description: "Hands-on skilling for herd management, breed care, and rural enterprise operations.",
      geography: "Madhya Pradesh"
    }),
    buildSolution("goat", "Method", "goat-method-1", "Goat Shed SOP Toolkit", "Rural Process Studio", {
      category: "Knowledge",
      offeringType: "SOP Manuals",
      description: "Operational playbooks for housing, feed rotation, vaccination, and hygiene routines.",
      geography: "Maharashtra"
    }),
    buildSolution("goat", "Material", "goat-material-1", "Mineral Mix and Feed Inputs", "Pashu Input Network", {
      offeringType: "Raw Material",
      description: "Input bundle covering mineral mix, fodder seed, and small-farm animal care supplies.",
      geography: "Karnataka"
    }),
    buildSolution("goat", "Machine", "goat-machine-1", "Fodder Chopper Machine", "AgroTech Innovations", {
      offeringType: "Machinery",
      geography: "Coimbatore, Tamil Nadu"
    }),
    buildSolution("goat", "Machine", "goat-machine-2", "Portable Milking Machine", "Surabhi Dairy Solutions", {
      offeringType: "Machinery",
      geography: "Pune, Maharashtra"
    }),
    buildSolution("goat", "Machine", "goat-machine-3", "Digital Weighing Scale", "Krishi Weigh Tech", {
      offeringType: "Machinery",
      geography: "Hyderabad, Telangana"
    }),
    buildSolution("goat", "Machine", "goat-machine-4", "Automatic Goat Feeder", "Farm Automations India", {
      offeringType: "Machinery",
      geography: "Bengaluru, Karnataka"
    }),
    buildSolution("goat", "Machine", "goat-machine-5", "Deworming Drench Gun", "VetEquip Solutions", {
      offeringType: "Machinery",
      geography: "Lucknow, Uttar Pradesh"
    }),
    buildSolution("goat", "Machine", "goat-machine-6", "Solar Water Pump", "GreenFlow Energy", {
      offeringType: "Machinery",
      geography: "Jaipur, Rajasthan"
    }),
    buildSolution("goat", "Money", "goat-money-1", "Livestock Credit Navigator", "Gram Finance Connect", {
      category: "Service",
      offeringType: "Financial support",
      description: "Credit readiness and livestock working-capital pathways for goat entrepreneurs.",
      geography: "India"
    }),
    buildSolution("goat", "Market", "goat-market-1", "Goat Meat Buyer Network", "Rural Market Access", {
      category: "Service",
      offeringType: "Market support",
      description: "Market linkages for live animal sales, meat buyers, and aggregation channels.",
      geography: "Telangana"
    })
  ],
  dairy: [
    buildSolution("dairy", "Manpower", "dairy-manpower-1", "Dairy Enterprise Skills Program", "MilkRise Academy", {
      category: "Service",
      offeringType: "Training"
    }),
    buildSolution("dairy", "Method", "dairy-method-1", "Clean Milking SOP Pack", "Dairy Systems Lab", {
      category: "Knowledge",
      offeringType: "SOP Manuals"
    }),
    buildSolution("dairy", "Material", "dairy-material-1", "Cattle Feed Resource Kit", "NutriFodder Collective", {
      offeringType: "Raw material"
    }),
    buildSolution("dairy", "Machine", "dairy-machine-1", "Bulk Milk Cooler", "ColdChain Rural", {
      offeringType: "Machinery"
    }),
    buildSolution("dairy", "Money", "dairy-money-1", "Dairy Capex Support Desk", "Milk Capital Partners", {
      category: "Service",
      offeringType: "Financial support"
    }),
    buildSolution("dairy", "Market", "dairy-market-1", "Village Milk Market Linkage", "FreshRoute Networks", {
      category: "Service",
      offeringType: "Market support"
    })
  ],
  bamboo: [
    buildSolution("bamboo", "Manpower", "bamboo-manpower-1", "Bamboo Artisan Training", "CraftGrow Foundation", {
      category: "Service",
      offeringType: "Training"
    }),
    buildSolution("bamboo", "Method", "bamboo-method-1", "Bamboo Treatment Workflow", "Green Material Studio", {
      category: "Knowledge",
      offeringType: "Tech transfer"
    }),
    buildSolution("bamboo", "Material", "bamboo-material-1", "Seasoned Bamboo Input Supply", "Bamboo Source India", {
      offeringType: "Raw material"
    }),
    buildSolution("bamboo", "Machine", "bamboo-machine-1", "Bamboo Splitting Unit", "EcoFab Machines", {
      offeringType: "Machinery"
    }),
    buildSolution("bamboo", "Money", "bamboo-money-1", "Craft Cluster Finance Support", "Rural Growth Finance", {
      category: "Service",
      offeringType: "Financial support"
    }),
    buildSolution("bamboo", "Market", "bamboo-market-1", "Bamboo Buyer Discovery", "EcoMarket Access", {
      category: "Service",
      offeringType: "Market support"
    })
  ],
  millet: [
    buildSolution("millet", "Manpower", "millet-manpower-1", "Millet Processing Workforce Training", "NutriAgri Skills", {
      category: "Service",
      offeringType: "Training"
    }),
    buildSolution("millet", "Method", "millet-method-1", "Millet Processing SOP Library", "Food Practice Hub", {
      category: "Knowledge",
      offeringType: "SOP Manuals"
    }),
    buildSolution("millet", "Material", "millet-material-1", "Millet Grain Sourcing Support", "Seed to Shelf Network", {
      offeringType: "Raw material"
    }),
    buildSolution("millet", "Machine", "millet-machine-1", "Millet Destoner and Cleaner", "AgriMill Tech", {
      offeringType: "Machinery"
    }),
    buildSolution("millet", "Money", "millet-money-1", "Processing Unit Finance", "Small Food Finance", {
      category: "Service",
      offeringType: "Financial support"
    }),
    buildSolution("millet", "Market", "millet-market-1", "Healthy Grains Market Channels", "Urban Rural Markets", {
      category: "Service",
      offeringType: "Market support"
    })
  ],
  turmeric: [
    buildSolution("turmeric", "Manpower", "turmeric-manpower-1", "Turmeric Value Addition Training", "Spice Skills Collective", {
      category: "Service",
      offeringType: "Training"
    }),
    buildSolution("turmeric", "Method", "turmeric-method-1", "Turmeric Processing Workflow", "SpiceTech Lab", {
      category: "Knowledge",
      offeringType: "Tech transfer"
    }),
    buildSolution("turmeric", "Material", "turmeric-material-1", "Boiling and Curing Inputs", "Golden Root Supply", {
      offeringType: "Raw material"
    }),
    buildSolution("turmeric", "Machine", "turmeric-machine-1", "Turmeric Polishing Machine", "Harvest Equip", {
      offeringType: "Machinery"
    }),
    buildSolution("turmeric", "Money", "turmeric-money-1", "Spice Processing Credit Support", "FarmScale Capital", {
      category: "Service",
      offeringType: "Financial support"
    }),
    buildSolution("turmeric", "Market", "turmeric-market-1", "Turmeric Buyer Connect", "SpiceRoute Markets", {
      category: "Service",
      offeringType: "Market support"
    })
  ]
};

