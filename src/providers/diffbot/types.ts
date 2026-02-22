// ── Diffbot Knowledge Graph API response types ──

export interface DiffbotEnhanceResponse {
  data: DiffbotEnhanceResult[];
  version: number;
  request_id?: string;
}

export interface DiffbotEnhanceResult {
  score: number;
  essentialScore?: number;
  entity: DiffbotEntity;
  errors?: string[];
}

export interface DiffbotEntity {
  id: string;
  type: string;
  name: string;
  summary?: string;
  description?: string;
  homepageUri?: string;
  logo?: string;
  nbEmployees?: number;
  nbEmployeesMax?: number;
  nbEmployeesMin?: number;
  yearlyRevenues?: DiffbotRevenue[];
  totalInvestment?: DiffbotAmount;
  investments?: DiffbotInvestment[];
  foundingDate?: DiffbotDate;
  categories?: DiffbotCategory[];
  industries?: DiffbotIndustry[];
  technographics?: DiffbotTechnographic[];
  locations?: DiffbotLocation[];
  stock?: DiffbotStock;
  socialProfiles?: DiffbotSocialProfile[];
  linkedInUri?: string;
  twitterUri?: string;
  githubUri?: string;
  crunchbaseUri?: string;
  // Person-specific fields
  nameDetail?: DiffbotNameDetail;
  employments?: DiffbotEmployment[];
  emailAddresses?: DiffbotEmail[];
  phoneNumbers?: DiffbotPhone[];
  gender?: string;
  birthDate?: DiffbotDate;
  educations?: DiffbotEducation[];
  skills?: DiffbotSkill[];
}

export interface DiffbotRevenue {
  revenue: DiffbotAmount;
  isCurrent?: boolean;
  year?: number;
}

export interface DiffbotAmount {
  value: number;
  currency?: string;
}

export interface DiffbotInvestment {
  series?: string;
  amount?: DiffbotAmount;
  date?: DiffbotDate;
  investors?: { name: string; type?: string }[];
}

export interface DiffbotDate {
  str: string;
  precision?: number;
  timestamp?: number;
}

export interface DiffbotCategory {
  name: string;
  diffbotUri?: string;
  isPrimary?: boolean;
}

export interface DiffbotIndustry {
  name: string;
  diffbotUri?: string;
}

export interface DiffbotTechnographic {
  name: string;
  categories?: string[];
}

export interface DiffbotLocation {
  isCurrent?: boolean;
  address?: string;
  city?: DiffbotGeoEntity;
  region?: DiffbotGeoEntity;
  country?: DiffbotGeoEntity;
  latitude?: number;
  longitude?: number;
}

export interface DiffbotGeoEntity {
  name: string;
}

export interface DiffbotStock {
  symbol?: string;
  exchange?: string;
}

export interface DiffbotSocialProfile {
  uri: string;
  typeName?: string;
}

export interface DiffbotNameDetail {
  firstName?: string;
  middleName?: string;
  lastName?: string;
  prefix?: string;
  suffix?: string;
}

export interface DiffbotEmployment {
  employer?: { name: string; homepageUri?: string; summary?: string };
  title?: string;
  isCurrent?: boolean;
  from?: DiffbotDate;
  to?: DiffbotDate;
  categories?: DiffbotCategory[];
}

export interface DiffbotEmail {
  address: string;
  type?: string;
  contactString?: string;
}

export interface DiffbotPhone {
  string: string;
  type?: string;
}

export interface DiffbotEducation {
  institution?: { name: string };
  degree?: string;
  major?: { name: string };
  from?: DiffbotDate;
  to?: DiffbotDate;
}

export interface DiffbotSkill {
  name: string;
}

// ── DQL search types ──

export interface DiffbotDqlResponse {
  data: DiffbotEntity[];
  hits: number;
  kgVersion?: string;
  queryCost?: number;
}
