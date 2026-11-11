import { create } from "zustand";
import type { Tenant, UserProfile } from "@/types/domain";

// Empty UI placeholders carry no identity or authority. Only the server session does.
const emptyUser: UserProfile = {
  id: "",
  tenantId: "",
  name: "",
  email: "",
  role: "BROKER",
  creci: "",
  phone: "",
  active: false,
};
const emptyTenant: Tenant = {
  id: "",
  name: "",
  slug: "",
  cnpj: "",
  creci: "",
  city: "",
  state: "",
  createdAt: "",
  branding: {
    primaryColor: "#1E56CC",
    accentColor: "",
    tagline: "",
    phone: "",
    whatsapp: "",
    email: "",
    address: "",
  },
};

interface TenantSessionState {
  isAuthenticated: boolean;
  currentTenant: Tenant;
  currentUser: UserProfile;
  loginAsUser: (user: UserProfile, tenant: Tenant) => void;
  syncSession: (user: UserProfile, tenant: Tenant) => void;
  logout: () => void;
}

export const useTenantStore = create<TenantSessionState>((set) => ({
  isAuthenticated: false,
  currentTenant: emptyTenant,
  currentUser: emptyUser,
  loginAsUser: (user, tenant) => {
    set({
      isAuthenticated: true,
      currentUser: user,
      currentTenant: tenant,
    });
  },
  syncSession: (user, tenant) =>
    set({ isAuthenticated: true, currentUser: user, currentTenant: tenant }),
  logout: () =>
    set({
      isAuthenticated: false,
      currentUser: emptyUser,
      currentTenant: emptyTenant,
    }),
}));
