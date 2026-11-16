import { UserRole } from "@/types/domain";

export type Permission =
  | "properties:view"
  | "properties:create"
  | "properties:edit"
  | "properties:delete"
  | "properties:audit_view"
  | "whitelabel:configure"
  | "crawler:manage"
  | "leads:view"
  | "leads:manage"
  | "leads:delete";

const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  BROKER: [
    "properties:view",
    "properties:create",
    "properties:edit",
    "properties:audit_view",
    "leads:view",
    "leads:manage",
  ],
  AGENCY_ADMIN: [
    "properties:view",
    "properties:create",
    "properties:edit",
    "properties:delete",
    "properties:audit_view",
    "whitelabel:configure",
    "crawler:manage",
    "leads:view",
    "leads:manage",
    "leads:delete",
  ],
  SUPER_ADMIN: [
    "properties:view",
    "properties:create",
    "properties:edit",
    "properties:delete",
    "properties:audit_view",
    "whitelabel:configure",
    "crawler:manage",
    "leads:view",
    "leads:manage",
    "leads:delete",
  ],
};

export function hasPermission(role: UserRole, permission: Permission): boolean {
  const allowed = ROLE_PERMISSIONS[role];
  if (!allowed) return false;
  return allowed.includes(permission);
}

export function assertPermission(role: UserRole, permission: Permission): void {
  if (!hasPermission(role, permission)) {
    throw new Error(
      `Acesso negado (RBAC): O perfil '${role}' não possui a permissão '${permission}'.`,
    );
  }
}

export function getRoleLabel(role: UserRole): string {
  switch (role) {
    case "SUPER_ADMIN":
      return "Super Admin (SaaS)";
    case "AGENCY_ADMIN":
      return "Gestor Imobiliário";
    case "BROKER":
      return "Corretor de Imóveis";
  }
}
