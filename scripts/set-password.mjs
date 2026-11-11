import postgres from "postgres";
import { emitKeypressEvents } from "node:readline";
import { createInterface } from "node:readline/promises";
import { databaseTlsOptions } from "../src/server/database/tls.mjs";
import { hashPassword } from "../src/server/services/password.mjs";

// Passwords never enter command arguments, terminal history, or environment files.
function hiddenQuestion(prompt) {
  process.stdout.write(prompt);
  emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  return new Promise((resolve, reject) => {
    let value = "";
    function finish(error) {
      process.stdin.removeListener("keypress", onKey);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write("\n");
      error ? reject(error) : resolve(value);
    }
    function onKey(text, key = {}) {
      if (key.ctrl && key.name === "c") return finish(new Error("CANCELLED"));
      if (key.name === "return" || key.name === "enter") return finish();
      if (key.name === "backspace") value = value.slice(0, -1);
      else if (!key.ctrl && !key.meta && text && !/[\x00-\x1f\x7f]/.test(text))
        value += text;
    }
    process.stdin.on("keypress", onKey);
  });
}

let sql;
try {
  if (!process.stdin.isTTY)
    throw new Error("Abra um terminal interativo para definir a senha.");
  if (!/^postgres(?:ql)?:\/\//.test(process.env.DATABASE_URL || ""))
    throw new Error("Configure DATABASE_URL no .env.local.");
  const terminal = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const email = (await terminal.question("E-mail da conta existente: "))
    .trim()
    .toLowerCase();
  terminal.close();
  const password = await hiddenQuestion(
    "Nova senha (12 a 128 caracteres; não será exibida): ",
  );
  const confirmation = await hiddenQuestion("Confirme a senha: ");
  if (password !== confirmation) throw new Error("As senhas não coincidem.");
  const hash = await hashPassword(password);
  sql = postgres(process.env.DATABASE_URL, {
    ssl: databaseTlsOptions(),
    max: 1,
    prepare: false,
    connect_timeout: 10,
  });
  await sql.begin(async (tx) => {
    const [user] =
      await tx`SELECT id FROM imovelink.users WHERE LOWER(email) = ${email} AND active = TRUE FOR UPDATE`;
    if (!user) throw new Error("Conta ativa não encontrada.");
    await tx`INSERT INTO imovelink.user_credentials (user_id, password_hash) VALUES (${user.id}, ${hash})
      ON CONFLICT (user_id) DO UPDATE SET password_hash = EXCLUDED.password_hash, updated_at = NOW()`;
    await tx`DELETE FROM imovelink.auth_sessions WHERE user_id = ${user.id}`;
  });
  console.log(
    "Senha definida. As sessões anteriores foram encerradas. Entre pelo login.",
  );
} catch (error) {
  const safe = [
    "Abra um terminal interativo para definir a senha.",
    "Configure DATABASE_URL no .env.local.",
    "As senhas não coincidem.",
    "Use uma senha de 12 a 128 caracteres.",
    "Conta ativa não encontrada.",
  ];
  console.error(
    safe.includes(error.message)
      ? error.message
      : "Não foi possível definir a senha. Confira a conexão e execute npm run db:migrate.",
  );
  process.exitCode = 1;
} finally {
  if (sql) await sql.end({ timeout: 5 });
}
