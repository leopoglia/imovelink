import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/server/services/password.mjs";

describe("Hash de senhas", () => {
  it("usa salts diferentes e só valida a senha correta", async () => {
    const password = "Uma senha longa para teste!";
    const first = await hashPassword(password);
    const second = await hashPassword(password);
    expect(first).not.toBe(second);
    expect(first).not.toContain(password);
    expect(await verifyPassword(password, first)).toBe(true);
    expect(await verifyPassword("Outra senha incorreta!", first)).toBe(false);
    expect(await verifyPassword(password, undefined)).toBe(false);
    expect(await verifyPassword(password, "corrupted")).toBe(false);
  }, 20000);
  it("recusa senhas curtas ou extensas sem truncá-las", async () => {
    await expect(hashPassword("short")).rejects.toThrow();
    await expect(hashPassword("a".repeat(129))).rejects.toThrow();
  });
});
