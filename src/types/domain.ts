export type UserRole = "SUPER_ADMIN" | "AGENCY_ADMIN" | "BROKER";

export type PropertyType =
  | "HOUSE"
  | "APARTMENT"
  | "COMMERCIAL"
  | "LAND"
  | "PENTHOUSE";
export type PropertyPurpose = "SALE" | "RENT" | "BOTH";
export type PropertyStatus = "AVAILABLE" | "RESERVED" | "SOLD" | "INACTIVE";

export type LeadStage =
  | "NEW"
  | "QUALIFYING"
  | "VISIT_SCHEDULED"
  | "PROPOSAL"
  | "WON"
  | "LOST";
export type LeadTemperature = "HOT" | "WARM" | "COLD";
export type LeadChannel =
  | "WHATSAPP"
  | "PORTAL_B2B"
  | "INSTAGRAM"
  | "INDICACAO"
  | "TELEFONE";

export type AuditAction =
  | "CREATED"
  | "PRICE_UPDATED"
  | "STATUS_CHANGED"
  | "EDITED"
  | "DELETED";

export interface TenantBranding {
  primaryColor: string;
  accentColor: string;
  tagline: string;
  phone: string;
  whatsapp: string;
  email: string;
  address: string;
  logoText?: string;
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  cnpj: string;
  creci: string;
  city: string;
  state: string;
  branding: TenantBranding;
  createdAt: string;
}

export interface UserProfile {
  id: string;
  tenantId: string;
  name: string;
  email: string;
  role: UserRole;
  creci: string;
  phone: string;
  avatarUrl?: string;
  active: boolean;
}

export interface AccountSettings {
  user: UserProfile;
  tenant: Tenant;
}

export interface Property {
  id: string;
  tenantId: string;
  brokerId: string;
  brokerName?: string;
  code: string;
  title: string;
  description: string;
  type: PropertyType;
  purpose: PropertyPurpose;
  status: PropertyStatus;
  price: number;
  condoFee: number;
  iptu: number;
  bedrooms: number;
  suites: number;
  bathrooms: number;
  parkingSpots: number;
  areaTotal: number;
  areaBuilt: number;
  addressStreet: string;
  addressNeighborhood: string;
  addressCity: string;
  addressState: string;
  addressZip: string;
  latitude: number;
  longitude: number;
  amenities: string[];
  images: string[];
  featured: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PropertyAuditLog {
  id: string;
  tenantId: string;
  propertyId: string;
  propertyCode: string;
  propertyTitle: string;
  userId: string;
  userName: string;
  userRole: UserRole;
  action: AuditAction;
  summary: string;
  beforeState?: Partial<Property> | null;
  afterState?: Partial<Property> | null;
  createdAt: string;
}

export interface AIExtractedLeadProfile {
  summary: string;
  preferredTypes: PropertyType[];
  preferredNeighborhoods: string[];
  mustHaveAmenities: string[];
  minBedrooms: number;
  urgencyLevel: "IMMEDIATE" | "SHORT_TERM" | "MEDIUM_TERM" | "EXPLORING";
  decisionMaker: string;
  financingNeed: boolean;
  recommendedWhatsAppPitch: string;
  scoringRationale: string[];
}

export interface Lead {
  id: string;
  tenantId: string;
  assignedBrokerId: string;
  assignedBrokerName?: string;
  name: string;
  email: string;
  phone: string;
  originChannel: LeadChannel;
  stage: LeadStage;
  aiScore: number;
  aiTemperature: LeadTemperature;
  naturalSearchDesire: string;
  aiExtractedProfile: AIExtractedLeadProfile;
  budgetMin: number;
  budgetMax: number;
  lgpdConsent: boolean;
  lastContactAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface StructuredPropertyQuery {
  rawQuery: string;
  intentSummary: string;
  propertyTypes: PropertyType[];
  purpose?: PropertyPurpose;
  minPrice?: number;
  maxPrice?: number;
  minBedrooms?: number;
  minSuites?: number;
  minParkingSpots?: number;
  neighborhoods: string[];
  mustHaveAmenities: string[];
  excludedAmenities?: string[];
  locationMode?: "exact" | "nearby";
  semanticKeywords: string[];
  aiModelUsed: string;
}

export interface HybridSearchResultItem {
  property: Property;
  hybridScore: number; // 0 to 100
  semanticScore: number; // 0 to 100
  attributeScore: number; // 0 to 100
  geoScore: number; // 0 to 100
  distanceKm: number | null;
  matchReasons: string[];
}

export interface HybridSearchResponse {
  query: StructuredPropertyQuery;
  results: HybridSearchResultItem[];
  executionTimeMs: number;
  totalCandidatesEvaluated: number;
  interpretation?: {
    mode: "ai" | "local";
    reason?: "not_configured" | "unavailable";
  };
}
