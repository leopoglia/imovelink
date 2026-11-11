import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/auth/route";
import { authRepository } from "@/server/repositories/auth.repository";
import { tenantRepository } from "@/server/repositories/tenant.repository";
import {
  SESSION_COOKIE,
  RECENT_COOKIE,
  tokenHash,
  readSession,
} from "@/server/services/auth.service";
import { verifyPassword } from "@/server/services/password.mjs";
import { SEED_USERS, SEED_TENANTS } from "@/server/seeds/seed-jaragua";

vi.mock("@/server/repositories/auth.repository", () => ({
  authRepository: {
    credential: vi.fn(),
    attempt: vi.fn(),
    issueLogin: vi.fn(),
    issueFromRemember: vi.fn(),
    sessionUser: vi.fn(),
    revoke: vi.fn(),
    revokeSession: vi.fn(),
  },
}));
vi.mock("@/server/repositories/tenant.repository", () => ({
  tenantRepository: {
    findUserById: vi.fn(),
    findUserByEmail: vi.fn(),
    findTenantById: vi.fn(),
  },
}));
vi.mock("@/server/services/password.mjs", () => ({ verifyPassword: vi.fn() }));
const token = "a".repeat(43);
const recentToken = "b".repeat(43);
const remembered = Buffer.from(
  JSON.stringify([{ userId: SEED_USERS[0].id, token: recentToken }]),
).toString("base64url");
function request(
  body: unknown,
  cookie = "",
  headers: Record<string, string> = {},
) {
  return new NextRequest("http://localhost/api/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie, ...headers },
    body: JSON.stringify(body),
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(authRepository.attempt).mockResolvedValue(true);
  vi.mocked(authRepository.credential).mockResolvedValue("private-hash");
  vi.mocked(authRepository.issueLogin).mockResolvedValue(true);
  vi.mocked(authRepository.issueFromRemember).mockResolvedValue(true);
  vi.mocked(authRepository.sessionUser).mockImplementation(async (hash) =>
    hash === tokenHash(token) ? SEED_USERS[0].id : undefined,
  );
  vi.mocked(verifyPassword).mockResolvedValue(true);
  vi.mocked(tenantRepository.findUserByEmail).mockResolvedValue(
    structuredClone(SEED_USERS[0]),
  );
  vi.mocked(tenantRepository.findUserById).mockResolvedValue(
    structuredClone(SEED_USERS[0]),
  );
  vi.mocked(tenantRepository.findTenantById).mockResolvedValue(
    structuredClone(SEED_TENANTS[0]),
  );
});

describe("Autenticação pelo servidor", () => {
  it("mantém a entrada recente de um usuário cujo ID legado foi convertido", async () => {
    const oldId = "u1111111-1111-4111-8111-111111111111";
    const oldCookie = Buffer.from(
      JSON.stringify([{ userId: oldId, token: recentToken }]),
    ).toString("base64url");
    const response = await POST(
      request(
        { action: "QUICK_LOGIN", userId: oldId },
        `${RECENT_COOKIE}=${oldCookie}`,
      ),
    );
    expect(response.status).toBe(200);
    expect(authRepository.issueFromRemember).toHaveBeenCalledWith(
      SEED_USERS[0].id,
      tokenHash(recentToken),
      expect.any(String),
    );
  });
  it("confere a senha e emite cookies HttpOnly sem devolver hashes ou tokens no JSON", async () => {
    const response = await POST(
      request({
        action: "LOGIN",
        email: SEED_USERS[0].email,
        password: "correct-password",
      }),
    );
    expect(response.status).toBe(200);
    expect(verifyPassword).toHaveBeenCalledWith(
      "correct-password",
      "private-hash",
    );
    expect(response.cookies.get(SESSION_COOKIE)?.httpOnly).toBe(true);
    expect(response.cookies.get(SESSION_COOKIE)?.sameSite).toBe("lax");
    expect(response.cookies.get(RECENT_COOKIE)?.httpOnly).toBe(true);
    const json = await response.json();
    expect(json).not.toHaveProperty("token");
    expect(JSON.stringify(json)).not.toContain("private-hash");
    const raw = response.cookies.get(SESSION_COOKIE)!.value;
    expect(authRepository.issueLogin).toHaveBeenCalledWith(
      SEED_USERS[0].id,
      "private-hash",
      tokenHash(raw),
      expect.any(String),
    );
  });
  it("recusa senha incorreta sem emitir sessão", async () => {
    vi.mocked(verifyPassword).mockResolvedValue(false);
    const response = await POST(
      request({
        action: "LOGIN",
        email: SEED_USERS[0].email,
        password: "wrong",
      }),
    );
    expect(response.status).toBe(401);
    expect(authRepository.issueLogin).not.toHaveBeenCalled();
    expect(response.cookies.get(SESSION_COOKIE)).toBeUndefined();
  });
  it("usa a mesma mensagem para conta inexistente e verifica o hash substituto", async () => {
    vi.mocked(tenantRepository.findUserByEmail).mockResolvedValue(undefined);
    vi.mocked(verifyPassword).mockResolvedValue(false);
    const response = await POST(
      request({
        action: "LOGIN",
        email: "unknown@example.com",
        password: "wrong",
      }),
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: "E-mail ou senha incorretos.",
    });
    expect(verifyPassword).toHaveBeenCalledWith("wrong", undefined);
  });
  it("não permite cadastrar ou assumir papéis pelo endpoint público", async () => {
    const response = await POST(
      request({
        action: "REGISTER",
        email: SEED_USERS[0].email,
        role: "SUPER_ADMIN",
      }),
    );
    expect(response.status).toBe(400);
    expect(authRepository.issueLogin).not.toHaveBeenCalled();
  });
  it("não aceita o antigo token demonstrativo nem tokens inventados", async () => {
    expect(await readSession("imv_tok_fake")).toBeNull();
    expect(await readSession("z".repeat(43))).toBeNull();
    const response = await GET(new NextRequest("http://localhost/api/auth"));
    expect(response.status).toBe(401);
  });
  it("recarrega o perfil atual e rejeita usuários desativados", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/auth", {
        headers: { Cookie: `${SESSION_COOKIE}=${token}` },
      }),
    );
    expect(response.status).toBe(200);
    vi.mocked(tenantRepository.findUserById).mockResolvedValue({
      ...SEED_USERS[0],
      active: false,
    });
    expect(await readSession(token)).toBeNull();
  });
  it("só abre um acesso recente se o banco validar o token deste navegador", async () => {
    const missing = await POST(
      request({ action: "QUICK_LOGIN", userId: SEED_USERS[0].id }),
    );
    expect(missing.status).toBe(401);
    const response = await POST(
      request(
        { action: "QUICK_LOGIN", userId: SEED_USERS[0].id },
        `${RECENT_COOKIE}=${remembered}`,
      ),
    );
    expect(response.status).toBe(200);
    expect(authRepository.issueFromRemember).toHaveBeenCalledWith(
      SEED_USERS[0].id,
      tokenHash(recentToken),
      expect.any(String),
    );
    vi.mocked(authRepository.issueFromRemember).mockResolvedValue(false);
    expect(
      (
        await POST(
          request(
            { action: "QUICK_LOGIN", userId: SEED_USERS[0].id },
            `${RECENT_COOKIE}=${remembered}`,
          ),
        )
      ).status,
    ).toBe(401);
  });
  it("revoga a sessão e os acessos lembrados no logout", async () => {
    const response = await POST(
      request(
        { action: "LOGOUT" },
        `${SESSION_COOKIE}=${token}; ${RECENT_COOKIE}=${remembered}`,
      ),
    );
    expect(response.status).toBe(200);
    expect(authRepository.revoke).toHaveBeenCalledWith([
      tokenHash(recentToken),
      tokenHash(token),
    ]);
    expect(response.cookies.get(SESSION_COOKIE)?.maxAge).toBe(0);
    expect(response.cookies.get(RECENT_COOKIE)?.maxAge).toBe(0);
  });
  it("remove um acesso lembrado e revoga sua autorização no servidor", async () => {
    const response = await POST(
      request(
        { action: "FORGET_RECENT", userId: SEED_USERS[0].id },
        `${RECENT_COOKIE}=${remembered}`,
      ),
    );
    expect(response.status).toBe(200);
    expect(authRepository.revoke).toHaveBeenCalledWith([
      tokenHash(recentToken),
    ]);
  });
  it("limita tentativas de login antes de processar a senha", async () => {
    vi.mocked(authRepository.attempt).mockResolvedValue(false);
    const response = await POST(
      request({
        action: "LOGIN",
        email: SEED_USERS[0].email,
        password: "wrong",
      }),
    );
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("900");
    expect(verifyPassword).not.toHaveBeenCalled();
  });
  it("bloqueia requisições de outra origem e formulários que não usam JSON", async () => {
    expect(
      (
        await POST(
          request({ action: "LOGOUT" }, "", {
            Origin: "https://other.example",
          }),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await POST(
          request({ action: "LOGOUT" }, "", { "Content-Type": "text/plain" }),
        )
      ).status,
    ).toBe(415);
  });
});
