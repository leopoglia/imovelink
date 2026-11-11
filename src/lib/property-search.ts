import type {
  PropertyStatus,
  PropertyType,
  StructuredPropertyQuery,
} from "@/types/domain";

export const PROPERTY_TYPE_LABELS: Record<PropertyType, string> = {
  HOUSE: "Casa",
  APARTMENT: "Apartamento",
  PENTHOUSE: "Cobertura",
  COMMERCIAL: "Comercial",
  LAND: "Terreno",
};
export const PROPERTY_STATUS_LABELS: Record<PropertyStatus, string> = {
  AVAILABLE: "Disponível",
  RESERVED: "Reservado",
  SOLD: "Vendido",
  INACTIVE: "Inativo",
};
export const formatPropertyPrice = (value: number) =>
  value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });

export function getSearchCriteria(query: StructuredPropertyQuery) {
  return [
    ...query.propertyTypes.map((type) => PROPERTY_TYPE_LABELS[type]),
    ...(query.purpose === "RENT"
      ? ["Aluguel"]
      : query.purpose === "SALE"
        ? ["Compra"]
        : []),
    ...(query.minPrice !== undefined
      ? [`A partir de ${formatPropertyPrice(query.minPrice)}`]
      : []),
    ...(query.maxPrice !== undefined
      ? [`Até ${formatPropertyPrice(query.maxPrice)}`]
      : []),
    ...(query.minBedrooms !== undefined
      ? [`${query.minBedrooms}+ quartos`]
      : []),
    ...(query.minSuites !== undefined ? [`${query.minSuites}+ suítes`] : []),
    ...(query.minParkingSpots !== undefined
      ? [`${query.minParkingSpots}+ vagas`]
      : []),
    ...query.neighborhoods.map((name) =>
      query.locationMode === "nearby" ? `Perto de ${name}` : name,
    ),
    ...query.mustHaveAmenities,
    ...(query.excludedAmenities ?? []).map((name) => `Sem ${name}`),
  ];
}
