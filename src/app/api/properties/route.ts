import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { propertyInput } from "@/server/services/property-input";
import { propertyService } from "@/server/services/property.service";
import {
  requireSession,
  authErrorResponse,
} from "@/server/services/auth.service";
import { externalSourceRepository } from "@/server/repositories/external-source.repository";
import { observarRota } from "@/server/observability/metrics";

async function handleGET(req: NextRequest) {
  try {
    const { tenant } = await requireSession(req, "properties:view");
    const { searchParams } = new URL(req.url);
    const tenantId = tenant.id;
    const includeAudit = searchParams.get("includeAudit") === "true";
    if (includeAudit) await requireSession(req, "properties:audit_view");
    // Anúncios de outros sites são só leitura e visíveis a quem consulta o
    // portfólio: o corretor precisa deles para atender o cliente.
    const includeExternal = searchParams.get("includeExternal") === "true";

    const [carteira, auditLogs, anunciosExternos, externalSources, saidos] =
      await Promise.all([
        propertyService.listProperties(tenantId),
        includeAudit ? propertyService.listAuditLogs(tenantId) : undefined,
        includeExternal
          ? externalSourceRepository.listListings(tenantId)
          : undefined,
        includeExternal
          ? externalSourceRepository.listByTenant(tenantId)
          : undefined,
        externalSourceRepository.urlsQueSairam(tenantId),
      ]);

    // Imóvel trazido de um anúncio que saiu da origem: o corretor confere se
    // foi vendido. A marca é só um aviso; o status continua sendo dele.
    const properties = carteira.map((imovel) =>
      imovel.sourceListingUrl && saidos.has(imovel.sourceListingUrl)
        ? { ...imovel, sourceListingRemoved: true }
        : imovel,
    );
    // O anúncio que já virou imóvel da carteira não aparece de novo como externo.
    const trazidos = new Set(
      carteira.map((imovel) => imovel.sourceListingUrl).filter(Boolean),
    );
    const externalListings = anunciosExternos?.filter(
      (anuncio) => !trazidos.has(anuncio.url),
    );

    return NextResponse.json(
      {
        properties,
        auditLogs,
        externalListings,
        externalSources: externalSources?.map((fonte) => ({
          id: fonte.id,
          name: fonte.name,
          logoUrl: fonte.logoUrl,
        })),
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

async function handlePOST(req: NextRequest) {
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

// Cada chamada é contada e cronometrada para o Prometheus.
export const GET = (req: NextRequest) =>
  observarRota("/api/properties", "GET", () => handleGET(req));

export const POST = (req: NextRequest) =>
  observarRota("/api/properties", "POST", () => handlePOST(req));
