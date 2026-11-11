import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
const options = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
/** @param {string} password @param {Buffer} salt @returns {Promise<Buffer>} */
function derive(password, salt) {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, options, (error, key) =>
      error ? reject(error) : resolve(key),
    );
  });
}
/** @param {string} password */
export async function hashPassword(password) {
  if (password.length < 12 || password.length > 128)
    throw new Error("Use uma senha de 12 a 128 caracteres.");
  const salt = randomBytes(16);
  const key = await derive(password, salt);
  return `scrypt$32768$8$3$${salt.toString("hex")}$${key.toString("hex")}`;
}
const dummyHash = `scrypt$32768$8$3$${"00".repeat(16)}$${"00".repeat(64)}`;
/** @param {string} password @param {string | undefined | null} stored */
export async function verifyPassword(password, stored) {
  const match = /^scrypt\$32768\$8\$3\$([a-f0-9]{32})\$([a-f0-9]{128})$/.exec(
    stored || dummyHash,
  );
  if (!match || password.length > 128) return false;
  const key = await derive(password, Buffer.from(match[1], "hex"));
  return timingSafeEqual(key, Buffer.from(match[2], "hex")) && Boolean(stored);
}
