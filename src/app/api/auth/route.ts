import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  assertSameOrigin,
  authService,
  authErrorResponse,
  requireSession,
} from "@/server/services/auth.service";

const schema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("LOGIN"),
      email: z
        .string()
        .trim()
        .email()
        .max(254)
        .transform((v) => v.toLowerCase()),
      password: z.string().min(1).max(128),
    })
    .strict(),
  z
    .object({
      action: z.literal("QUICK_LOGIN"),
      userId: z.string().min(1).max(128),
    })
    .strict(),
  z
    .object({
      action: z.literal("FORGET_RECENT"),
      userId: z.string().min(1).max(128),
    })
    .strict(),
  z.object({ action: z.literal("LOGOUT") }).strict(),
]);
export async function GET(req: NextRequest) {
  try {
    return NextResponse.json(await requireSession(req), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return (
      authErrorResponse(error) ??
      NextResponse.json(
        { error: "Não foi possível verificar sua sessão." },
        { status: 503 },
      )
    );
  }
}
export async function POST(req: NextRequest) {
  try {
    assertSameOrigin(req);
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success)
      return NextResponse.json(
        { error: "Confira os dados informados." },
        { status: 400 },
      );
    const body = parsed.data;
    switch (body.action) {
      case "LOGIN":
        return await authService.login(req, body.email, body.password);
      case "QUICK_LOGIN":
        return await authService.quickLogin(req, body.userId);
      case "FORGET_RECENT":
        return await authService.forget(req, body.userId);
      case "LOGOUT":
        return await authService.logout(req);
    }
  } catch (error) {
    return (
      authErrorResponse(error) ??
      NextResponse.json(
        {
          error:
            error instanceof SyntaxError
              ? "Dados inválidos."
              : "Não foi possível concluir a autenticação.",
        },
        { status: error instanceof SyntaxError ? 400 : 503 },
      )
    );
  }
}
