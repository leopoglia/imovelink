import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import {
  requireSession,
  authErrorResponse,
} from "@/server/services/auth.service";
import {
  SettingsError,
  settingsService,
} from "@/server/services/settings.service";
import { observarRota } from "@/server/observability/metrics";

function errorResponse(error: unknown) {
  const denied = authErrorResponse(error);
  if (denied) return denied;
  if (error instanceof SettingsError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.status },
    );
  }
  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: error.issues[0]?.message ?? "Confira os dados informados." },
      { status: 400 },
    );
  }
  if (error instanceof SyntaxError) {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  }
  return NextResponse.json(
    { error: "Não foi possível salvar as configurações." },
    { status: 500 },
  );
}

async function handleGET(request: NextRequest) {
  try {
    const { user, tenant } = await requireSession(request);
    return NextResponse.json(
      await settingsService.getSettings(user.id, tenant.id),
      {
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

async function handlePATCH(request: NextRequest) {
  try {
    const { user, tenant } = await requireSession(request);
    const body = await request.json();
    return NextResponse.json(
      await settingsService.updateSettings({
        section: body.section,
        values: body.values,
        userId: user.id,
        tenantId: tenant.id,
      }),
    );
  } catch (error) {
    return errorResponse(error);
  }
}

// Cada chamada é contada e cronometrada para o Prometheus.
export const GET = (request: NextRequest) =>
  observarRota("/api/settings", "GET", () => handleGET(request));

export const PATCH = (request: NextRequest) =>
  observarRota("/api/settings", "PATCH", () => handlePATCH(request));
