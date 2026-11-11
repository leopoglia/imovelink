import {
  AuditAction,
  Property,
  PropertyAuditLog,
  PropertyPurpose,
  PropertyStatus,
  PropertyType,
  UserRole,
} from "@/types/domain";
import { assertPermission } from "@/lib/auth/rbac";
import { obterCoordenadasBairro } from "@/lib/geo";
import { propertyRepository } from "@/server/repositories/property.repository";
import { withDatabaseTransaction } from "@/server/database/postgres";

export interface CreatePropertyInput {
  tenantId: string;
  userId: string;
  userName: string;
  userRole: UserRole;
  title: string;
  description: string;
  type: PropertyType;
  purpose: PropertyPurpose;
  status?: PropertyStatus;
  price: number;
  condoFee?: number;
  iptu?: number;
  bedrooms: number;
  suites: number;
  bathrooms: number;
  parkingSpots: number;
  areaTotal: number;
  areaBuilt: number;
  addressStreet: string;
  addressNeighborhood: string;
  addressCity?: string;
  addressState?: string;
  addressZip?: string;
  latitude?: number;
  longitude?: number;
  amenities: string[];
  images?: string[];
  featured?: boolean;
}

export interface UpdatePropertyInput {
  tenantId: string;
  propertyId: string;
  userId: string;
  userName: string;
  userRole: UserRole;
  updates: Partial<
    Omit<Property, "id" | "tenantId" | "code" | "createdAt" | "updatedAt">
  >;
}

export class PropertyService {
  async listProperties(tenantId: string): Promise<Property[]> {
    return await propertyRepository.findAllByTenant(tenantId);
  }

  async listAuditLogs(
    tenantId: string,
    propertyId?: string,
  ): Promise<PropertyAuditLog[]> {
    return await propertyRepository.findAuditLogsByTenant(tenantId, propertyId);
  }

  async createProperty(input: CreatePropertyInput): Promise<Property> {
    assertPermission(input.userRole, "properties:create");
    return withDatabaseTransaction(async () => {
      const code = await propertyRepository.nextCode(input.tenantId);

      const geo =
        input.latitude !== undefined && input.longitude !== undefined
          ? { latitude: input.latitude, longitude: input.longitude }
          : obterCoordenadasBairro(input.addressNeighborhood);

      const now = new Date().toISOString();

      const defaultImage =
        input.type === "APARTMENT"
          ? "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=1000&q=80"
          : input.type === "COMMERCIAL"
            ? "https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=1000&q=80"
            : "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=1000&q=80";

      const newProperty: Property = {
        id: crypto.randomUUID(),
        tenantId: input.tenantId,
        brokerId: input.userId,
        brokerName: input.userName,
        code,
        title: input.title,
        description: input.description,
        type: input.type,
        purpose: input.purpose,
        status: input.status ?? "AVAILABLE",
        price: Number(input.price),
        condoFee: Number(input.condoFee ?? 0),
        iptu: Number(input.iptu ?? 0),
        bedrooms: Number(input.bedrooms),
        suites: Number(input.suites),
        bathrooms: Number(input.bathrooms),
        parkingSpots: Number(input.parkingSpots),
        areaTotal: Number(input.areaTotal),
        areaBuilt: Number(input.areaBuilt),
        addressStreet: input.addressStreet,
        addressNeighborhood: input.addressNeighborhood,
        addressCity: input.addressCity ?? "Jaraguá do Sul",
        addressState: input.addressState ?? "SC",
        addressZip: input.addressZip ?? "89251-000",
        latitude: geo.latitude,
        longitude: geo.longitude,
        amenities: input.amenities,
        images:
          input.images && input.images.length > 0
            ? input.images
            : [defaultImage],
        featured: Boolean(input.featured),
        createdAt: now,
        updatedAt: now,
      };

      await propertyRepository.create(newProperty);

      await propertyRepository.createAuditLog({
        id: crypto.randomUUID(),
        tenantId: input.tenantId,
        propertyId: newProperty.id,
        propertyCode: newProperty.code,
        propertyTitle: newProperty.title,
        userId: input.userId,
        userName: input.userName,
        userRole: input.userRole,
        action: "CREATED",
        summary: `Imóvel ${newProperty.code} cadastrado no bairro ${newProperty.addressNeighborhood} por R$ ${newProperty.price.toLocaleString("pt-BR")}.`,
        beforeState: null,
        afterState: {
          price: newProperty.price,
          status: newProperty.status,
          addressNeighborhood: newProperty.addressNeighborhood,
        },
        createdAt: now,
      });

      return newProperty;
    });
  }

  async updateProperty(input: UpdatePropertyInput): Promise<Property> {
    assertPermission(input.userRole, "properties:edit");
    return withDatabaseTransaction(async () => {
      const current = await propertyRepository.findById(
        input.tenantId,
        input.propertyId,
      );
      if (!current) {
        throw new Error("Imóvel não encontrado.");
      }

      const nextUpdates: Partial<Property> = { ...input.updates };

      if (
        (input.updates.addressStreet || input.updates.addressNeighborhood) &&
        input.updates.latitude === undefined
      ) {
        const geo = obterCoordenadasBairro(
          input.updates.addressNeighborhood ?? current.addressNeighborhood,
        );
        nextUpdates.latitude = geo.latitude;
        nextUpdates.longitude = geo.longitude;
      }

      let action: AuditAction = "EDITED";
      const summaryParts: string[] = [];

      if (
        input.updates.price !== undefined &&
        input.updates.price !== current.price
      ) {
        action = "PRICE_UPDATED";
        summaryParts.push(
          `Preço alterado de R$ ${current.price.toLocaleString("pt-BR")} para R$ ${input.updates.price.toLocaleString("pt-BR")}`,
        );
      }

      if (
        input.updates.status !== undefined &&
        input.updates.status !== current.status
      ) {
        action = "STATUS_CHANGED";
        summaryParts.push(
          `Status alterado de ${current.status} para ${input.updates.status}`,
        );
      }

      if (summaryParts.length === 0) {
        summaryParts.push(`Dados do imóvel ${current.code} atualizados`);
      }

      const updated = await propertyRepository.update(
        input.tenantId,
        input.propertyId,
        nextUpdates,
      );
      if (!updated) {
        throw new Error("Falha ao atualizar imóvel.");
      }

      await propertyRepository.createAuditLog({
        id: crypto.randomUUID(),
        tenantId: input.tenantId,
        propertyId: updated.id,
        propertyCode: updated.code,
        propertyTitle: updated.title,
        userId: input.userId,
        userName: input.userName,
        userRole: input.userRole,
        action,
        summary: `${summaryParts.join(" | ")}.`,
        beforeState: {
          price: current.price,
          status: current.status,
          title: current.title,
        },
        afterState: {
          price: updated.price,
          status: updated.status,
          title: updated.title,
        },
        createdAt: new Date().toISOString(),
      });

      return updated;
    });
  }

  async deleteProperty(
    tenantId: string,
    propertyId: string,
    userId: string,
    userName: string,
    userRole: UserRole,
  ): Promise<boolean> {
    assertPermission(userRole, "properties:delete");
    return withDatabaseTransaction(async () => {
      const current = await propertyRepository.findById(tenantId, propertyId);
      if (!current) return false;

      const deleted = await propertyRepository.delete(tenantId, propertyId);
      if (deleted) {
        await propertyRepository.createAuditLog({
          id: crypto.randomUUID(),
          tenantId,
          propertyId: current.id,
          propertyCode: current.code,
          propertyTitle: current.title,
          userId,
          userName,
          userRole,
          action: "DELETED",
          summary: `Imóvel ${current.code} (${current.title}) excluído do portfólio.`,
          beforeState: { price: current.price, status: current.status },
          afterState: null,
          createdAt: new Date().toISOString(),
        });
      }
      return deleted;
    });
  }
}

export const propertyService = new PropertyService();
