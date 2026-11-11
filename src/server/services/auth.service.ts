import { createHash, randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { authRepository } from "@/server/repositories/auth.repository";
import { tenantRepository } from "@/server/repositories/tenant.repository";
import { verifyPassword } from "./password.mjs";
import { hasPermission, type Permission } from "@/lib/auth/rbac";
import type { AccountSettings } from "@/types/domain";
import { legacyUuid } from "@/server/database/identifiers.mjs";

export const SESSION_COOKIE = "imovelink_session";
export const RECENT_COOKIE = "imovelink_recent_sessions";
export const SESSION_TTL = 12 * 60 * 60;
const REMEMBER_TTL = 30 * 24 * 60 * 60;
const validToken = (value?: string): value is string =>
  Boolean(value && /^[A-Za-z0-9_-]{43}$/.test(value));
export const tokenHash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
type RecentToken = { userId: string; token: string };

export class AuthError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
function recentTokens(value?: string): RecentToken[] {
  if (!value || value.length > 2000) return [];
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item) =>
          item &&
          typeof item.userId === "string" &&
          item.userId.length > 0 &&
          item.userId.length <= 128 &&
          validToken(item.token),
      )
      .slice(0, 3)
      .map((item) => ({
        userId: legacyUuid("users", item.userId),
        token: item.token,
      }));
  } catch {
    return [];
  }
}
const cookieOptions = (maxAge: number, path = "/") => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path,
  maxAge,
});
function writeRecent(response: NextResponse, entries: RecentToken[]) {
  response.cookies.set(
    RECENT_COOKIE,
    entries.length
      ? Buffer.from(JSON.stringify(entries)).toString("base64url")
      : "",
    cookieOptions(entries.length ? REMEMBER_TTL : 0, "/api/auth"),
  );
}
async function account(userId?: string): Promise<AccountSettings | null> {
  if (!userId) return null;
  const user = await tenantRepository.findUserById(userId);
  if (!user?.active) return null;
  const tenant = await tenantRepository.findTenantById(user.tenantId);
  return tenant ? { user, tenant } : null;
}
export async function readSession(token?: string) {
  if (!validToken(token)) return null;
  return account(await authRepository.sessionUser(tokenHash(token)));
}
export async function requirePageSession() {
  return readSession((await cookies()).get(SESSION_COOKIE)?.value);
}
export function assertSameOrigin(req: NextRequest) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return;
  const origin = req.headers.get("origin");
  const expected = process.env.APP_ORIGIN || req.nextUrl.origin;
  if (
    (origin && origin !== expected) ||
    req.headers.get("sec-fetch-site") === "cross-site"
  )
    throw new AuthError("Origem da requisição não permitida.", 403);
  if (
    !req.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json")
  )
    throw new AuthError("Envie os dados em JSON.", 415);
}
export async function requireSession(
  req: NextRequest,
  permission?: Permission,
) {
  assertSameOrigin(req);
  const session = await readSession(req.cookies.get(SESSION_COOKIE)?.value);
  if (!session)
    throw new AuthError("Sua sessão expirou. Entre novamente.", 401);
  if (permission && !hasPermission(session.user.role, permission))
    throw new AuthError("Você não tem permissão para esta ação.", 403);
  return session;
}
export function authErrorResponse(error: unknown) {
  if (!(error instanceof AuthError)) return null;
  const response = NextResponse.json(
    { error: error.message },
    { status: error.status, headers: { "Cache-Control": "no-store" } },
  );
  if (error.status === 429) response.headers.set("Retry-After", "900");
  return response;
}
export const authService = {
  async login(req: NextRequest, email: string, password: string) {
    if (!(await authRepository.attempt(tokenHash(`login:${email}`))))
      throw new AuthError(
        "Muitas tentativas. Aguarde 15 minutos e tente novamente.",
        429,
      );
    const user = await tenantRepository.findUserByEmail(email);
    const hash = user ? await authRepository.credential(user.id) : undefined;
    const verified = await verifyPassword(password, hash);
    const settings = await account(user?.id);
    if (!verified || !hash || !settings)
      throw new AuthError("E-mail ou senha incorretos.", 401);
    const session = randomBytes(32).toString("base64url");
    const remember = randomBytes(32).toString("base64url");
    if (
      !(await authRepository.issueLogin(
        settings.user.id,
        hash,
        tokenHash(session),
        tokenHash(remember),
      ))
    )
      throw new AuthError("E-mail ou senha incorretos.", 401);
    const old = recentTokens(req.cookies.get(RECENT_COOKIE)?.value);
    const retained = old
      .filter((item) => item.userId !== settings.user.id)
      .slice(0, 2);
    await authRepository.revoke(
      old
        .filter((item) => !retained.includes(item))
        .map((item) => tokenHash(item.token)),
    );
    const previous = req.cookies.get(SESSION_COOKIE)?.value;
    if (validToken(previous))
      await authRepository.revokeSession(tokenHash(previous));
    const response = NextResponse.json(settings, {
      headers: { "Cache-Control": "no-store" },
    });
    response.cookies.set(SESSION_COOKIE, session, cookieOptions(SESSION_TTL));
    writeRecent(response, [
      { userId: settings.user.id, token: remember },
      ...retained,
    ]);
    response.cookies.set(
      "imovelink_recent_accounts",
      "",
      cookieOptions(0, "/api/auth"),
    );
    return response;
  },
  async quickLogin(req: NextRequest, userId: string) {
    userId = legacyUuid("users", userId);
    const entry = recentTokens(req.cookies.get(RECENT_COOKIE)?.value).find(
      (item) => item.userId === userId,
    );
    const settings = await account(userId);
    if (!entry || !settings)
      throw new AuthError(
        "Este acesso expirou. Entre com sua senha novamente.",
        401,
      );
    const session = randomBytes(32).toString("base64url");
    if (
      !(await authRepository.issueFromRemember(
        userId,
        tokenHash(entry.token),
        tokenHash(session),
      ))
    )
      throw new AuthError(
        "Este acesso expirou. Entre com sua senha novamente.",
        401,
      );
    const previous = req.cookies.get(SESSION_COOKIE)?.value;
    if (validToken(previous))
      await authRepository.revokeSession(tokenHash(previous));
    const response = NextResponse.json(settings, {
      headers: { "Cache-Control": "no-store" },
    });
    response.cookies.set(SESSION_COOKIE, session, cookieOptions(SESSION_TTL));
    return response;
  },
  async forget(req: NextRequest, userId: string) {
    userId = legacyUuid("users", userId);
    const entries = recentTokens(req.cookies.get(RECENT_COOKIE)?.value);
    await authRepository.revoke(
      entries
        .filter((entry) => entry.userId === userId)
        .map((entry) => tokenHash(entry.token)),
    );
    const response = NextResponse.json({ ok: true });
    writeRecent(
      response,
      entries.filter((entry) => entry.userId !== userId),
    );
    return response;
  },
  async logout(req: NextRequest) {
    const tokens = recentTokens(req.cookies.get(RECENT_COOKIE)?.value).map(
      (entry) => tokenHash(entry.token),
    );
    const session = req.cookies.get(SESSION_COOKIE)?.value;
    if (validToken(session)) tokens.push(tokenHash(session));
    await authRepository.revoke(tokens);
    const response = NextResponse.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } },
    );
    response.cookies.set(SESSION_COOKIE, "", cookieOptions(0));
    writeRecent(response, []);
    return response;
  },
};
