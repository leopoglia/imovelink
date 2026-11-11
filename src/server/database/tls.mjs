import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** @returns {'verify-full' | import('node:tls').ConnectionOptions} */
export function databaseTlsOptions() {
  const certificatePath = process.env.DATABASE_SSL_CA_FILE?.trim();
  if (!certificatePath) return "verify-full";
  try {
    return {
      rejectUnauthorized: true,
      ca: readFileSync(resolve(certificatePath), "utf8"),
    };
  } catch {
    throw Object.assign(
      new Error(
        "Configure um arquivo de certificado CA válido em DATABASE_SSL_CA_FILE.",
      ),
      { code: "DATABASE_CA_FILE_MISSING" },
    );
  }
}
