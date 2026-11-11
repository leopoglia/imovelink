import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { propertyUpdates } from "@/server/services/property-input";
import { propertyService } from "@/server/services/property.service";
import {
  requireSession,
  authErrorResponse,
} from "@/server/services/auth.service";

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { tenant, user } = await requireSession(req, "properties:edit");
    const { id } = await context.params;
    if (!z.string().uuid().safeParse(id).success)
      return NextResponse.json(
        { error: "Imóvel não encontrado." },
        { status: 404 },
      );
    const body = await req.json();

    const tenantId = tenant.id;
    const userId = user.id;
    const userName = user.name;
    const userRole = user.role;

    const updated = await propertyService.updateProperty({
      tenantId,
      propertyId: id,
      userId,
      userName,
      userRole,
      updates: propertyUpdates.parse(body.updates),
    });

    return NextResponse.json({ property: updated });
  } catch (error) {
    const denied = authErrorResponse(error);
    if (denied) return denied;
    const message =
      error instanceof ZodError
        ? "Confira os dados do imóvel."
        : "Não foi possível atualizar o imóvel.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { tenant, user } = await requireSession(req, "properties:delete");
    const { id } = await context.params;
    if (!z.string().uuid().safeParse(id).success)
      return NextResponse.json(
        { error: "Imóvel não encontrado." },
        { status: 404 },
      );
    const tenantId = tenant.id;
    const userId = user.id;
    const userName = user.name;
    const userRole = user.role;

    const deleted = await propertyService.deleteProperty(
      tenantId,
      id,
      userId,
      userName,
      userRole,
    );

    if (!deleted) {
      return NextResponse.json(
        { error: "Imóvel não encontrado." },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const denied = authErrorResponse(error);
    if (denied) return denied;
    return NextResponse.json(
      { error: "Não foi possível excluir o imóvel." },
      { status: 500 },
    );
  }
}
