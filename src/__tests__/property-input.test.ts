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
