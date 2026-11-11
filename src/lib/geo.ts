/**
 * Coordenadas de referência e cálculo de distâncias entre bairros.
 */

export interface Coordenada {
  bairro: string;
  latitude: number;
  longitude: number;
}

// Coordenadas centrais aproximadas dos bairros de Jaraguá do Sul - SC
export const BAIRROS_JARAGUA: Record<string, Coordenada> = {
  centro: { bairro: "Centro", latitude: -26.4851, longitude: -49.0713 },
  "vila nova": { bairro: "Vila Nova", latitude: -26.4792, longitude: -49.0846 },
  czerniewicz: {
    bairro: "Czerniewicz",
    latitude: -26.4775,
    longitude: -49.0642,
  },
  baependi: { bairro: "Baependi", latitude: -26.4918, longitude: -49.0621 },
  "ilha da figueira": {
    bairro: "Ilha da Figueira",
    latitude: -26.4995,
    longitude: -49.0488,
  },
  "agua verde": {
    bairro: "Água Verde",
    latitude: -26.4712,
    longitude: -49.0518,
  },
  "barra do rio cerro": {
    bairro: "Barra do Rio Cerro",
    latitude: -26.5162,
    longitude: -49.1245,
  },
  rau: { bairro: "Rau", latitude: -26.4685, longitude: -49.1088 },
  amizade: { bairro: "Amizade", latitude: -26.4698, longitude: -49.0421 },
  "jaragua esquerdo": {
    bairro: "Jaraguá Esquerdo",
    latitude: -26.4912,
    longitude: -49.0865,
  },
};

/**
 * Remove acentos e padroniza para letras minúsculas
 */
export function normalizarTexto(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/**
 * Calcula a distância em quilômetros entre dois pontos usando a fórmula de Haversine
 */
export function calcularDistanciaKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const raioTerraKm = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number((raioTerraKm * c).toFixed(1));
}

/**
 * Retorna as coordenadas aproximadas de um endereço ou bairro de Jaraguá do Sul
 */
export function obterCoordenadasBairro(bairro: string): {
  latitude: number;
  longitude: number;
} {
  const norm = normalizarTexto(bairro);
  for (const [chave, coord] of Object.entries(BAIRROS_JARAGUA)) {
    if (norm.includes(chave) || chave.includes(norm)) {
      return { latitude: coord.latitude, longitude: coord.longitude };
    }
  }
  // Coordenada padrão do Centro de Jaraguá do Sul
  return { latitude: -26.4851, longitude: -49.0713 };
}
