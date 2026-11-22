import { describe, expect, it } from "vitest";
import { propertyInput } from "@/server/services/property-input";

const minimo = {
  title: "Casa no Centro",
  description: "Casa ampla.",
  price: 500000,
  addressNeighborhood: "Centro",
};

describe("Dados do imóvel no servidor", () => {
  it("aceita imóvel sem rua e número", () => {
    expect(propertyInput.parse(minimo).addressStreet).toBe("");
    expect(
      propertyInput.parse({ ...minimo, addressStreet: "   " }).addressStreet,
    ).toBe("");
  });

  it("continua exigindo o bairro", () => {
    expect(() =>
      propertyInput.parse({ ...minimo, addressNeighborhood: "" }),
    ).toThrow();
  });
});

describe("Anúncio de origem do imóvel", () => {
  it("aceita o endereço do anúncio e o deixa opcional", () => {
    expect(propertyInput.parse(minimo).sourceListingUrl).toBeUndefined();
    expect(
      propertyInput.parse({
        ...minimo,
        sourceListingUrl: "https://outrosite.com/imovel/9",
      }).sourceListingUrl,
    ).toBe("https://outrosite.com/imovel/9");
  });

  it("recusa endereço que não seja http ou https", () => {
    expect(() =>
      propertyInput.parse({
        ...minimo,
        sourceListingUrl: "javascript:alert(1)",
      }),
    ).toThrow();
  });
});
