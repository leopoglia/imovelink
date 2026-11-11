import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { propertyInput } from "@/server/services/property-input";
import { propertyService } from "@/server/services/property.service";
import {
  requireSession,
  authErrorResponse,
} from "@/server/services/auth.service";

export async function GET(req: NextRequest) {
  try {
    const { tenant } = await requireSession(req, "properties:view");
    const { searchParams } = new URL(req.url);
    const tenantId = tenant.id;
    const includeAudit = searchParams.get("includeAudit") === "true";
    if (includeAudit) await requireSession(req, "properties:audit_view");

    const properties = await propertyService.listProperties(tenantId);
    const auditLogs = includeAudit
      ? await propertyService.listAuditLogs(tenantId)
      : undefined;

    return NextResponse.json(
      {
        properties,
        auditLogs,
        total: properties.length,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return (
      authErrorResponse(error) ??
      NextResponse.json(
        { error: "Não foi possível carregar os imóveis." },
        { status: 500 },
      )
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const { tenant, user } = await requireSession(req, "properties:create");
    const body = await req.json();
    const tenantId = tenant.id;
    const userId = user.id;
    const userName = user.name;
    const userRole = user.role;

    const created = await propertyService.createProperty({
      tenantId,
      userId,
      userName,
      userRole,
      ...propertyInput.parse(body),
    });

    return NextResponse.json({ property: created }, { status: 201 });
  } catch (error) {
    const denied = authErrorResponse(error);
    if (denied) return denied;
    const message =
      error instanceof ZodError
        ? "Confira os dados do imóvel."
        : "Não foi possível cadastrar o imóvel.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
