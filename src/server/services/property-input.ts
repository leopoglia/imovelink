import { z } from "zod";
const amount = z.number().finite().min(0).max(99999999999);
const count = z.number().int().min(0).max(1000);
export const propertyInput = z.object({
  title: z.string().trim().min(3).max(240),
  description: z.string().trim().min(3).max(15000),
  type: z
    .enum(["HOUSE", "APARTMENT", "COMMERCIAL", "LAND", "PENTHOUSE"])
    .default("HOUSE"),
  purpose: z.enum(["SALE", "RENT", "BOTH"]).default("SALE"),
  status: z
    .enum(["AVAILABLE", "RESERVED", "SOLD", "INACTIVE"])
    .default("AVAILABLE"),
  price: amount,
  condoFee: amount.default(0),
  iptu: amount.default(0),
  bedrooms: count.default(0),
  suites: count.default(0),
  bathrooms: count.default(0),
  parkingSpots: count.default(0),
  areaTotal: amount.default(0),
  areaBuilt: amount.default(0),
  addressStreet: z.string().trim().min(1).max(240),
  addressNeighborhood: z.string().trim().min(1).max(100),
  addressCity: z.string().trim().min(1).max(100).default("Jaraguá do Sul"),
  addressState: z
    .string()
    .regex(/^[A-Z]{2}$/)
    .default("SC"),
  addressZip: z.string().max(12).default(""),
  amenities: z.array(z.string().trim().min(1).max(120)).max(100).default([]),
  images: z
    .array(
      z
        .string()
        .url()
        .refine((value) => /^https?:\/\//.test(value)),
    )
    .max(30)
    .default([]),
  featured: z.boolean().default(false),
});
export const propertyUpdates = propertyInput
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0);
