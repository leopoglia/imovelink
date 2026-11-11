"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowUpRight,
  Building,
  City,
  ShopWindow,
  LayoutLeft,
  Menu,
  AreaSearch,
  Xmark,
} from "iconoir-react";
import { Brand } from "./brand";
import { AccountMenu } from "./account-menu";
import { useTenantStore } from "@/store/tenant-store";
import { fetchSettings, settingsQueryKey } from "@/lib/settings";

const NAV_ITEMS = [
  { href: "/", label: "Visão geral", icon: LayoutLeft },
  { href: "/imoveis", label: "Imóveis", icon: City },
  { href: "/busca-ia", label: "Busca inteligente", icon: AreaSearch },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);
  const queryClient = useQueryClient();
  const { currentTenant, currentUser, isAuthenticated, syncSession, logout } =
    useTenantStore();
  const publicPage =
    pathname?.startsWith("/vitrine") || pathname?.startsWith("/login");
  const { data: settings } = useQuery({
    queryKey: settingsQueryKey(currentTenant.id, currentUser.id),
    queryFn: () => fetchSettings(currentTenant.id, currentUser.id),
    enabled: isAuthenticated && !publicPage,
    retry: false,
  });

  useEffect(() => {
    if (settings && !publicPage && isAuthenticated)
      syncSession(settings.user, settings.tenant);
  }, [settings, publicPage, isAuthenticated, syncSession]);

  if (pathname?.startsWith("/vitrine") || pathname?.startsWith("/login"))
    return <>{children}</>;

  const pageLabel =
    pathname === "/configuracoes"
      ? "Configurações"
      : (NAV_ITEMS.find((item) => item.href === pathname)?.label ??
        "Imovelink");

  return (
    <div className="app-frame">
      <a href="#main-content" className="skip-link">
        Ir para o conteúdo
      </a>
      <aside className="app-sidebar" aria-label="Navegação principal">
        <div className="sidebar-brand">
          <Brand />
          <button
            type="button"
            className="icon-button mobile-menu"
            aria-label={menuOpen ? "Fechar menu" : "Abrir menu"}
            aria-expanded={menuOpen}
            aria-controls="sidebar-navigation"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            {menuOpen ? (
              <Xmark aria-hidden="true" width={21} height={21} />
            ) : (
              <Menu aria-hidden="true" width={21} height={21} />
            )}
          </button>
        </div>
        <div
          id="sidebar-navigation"
          className={`sidebar-content ${menuOpen ? "is-open" : ""}`}
        >
          <nav className="sidebar-nav" aria-label="Gestão imobiliária">
            {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
              const active =
                href === "/" ? pathname === "/" : pathname?.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={`nav-link ${active ? "active" : ""}`}
                  aria-current={active ? "page" : undefined}
                  onClick={() => setMenuOpen(false)}
                >
                  <Icon aria-hidden="true" />
                  {label}
                </Link>
              );
            })}
          </nav>
          <div className="nav-secondary">
            <nav className="sidebar-nav" aria-label="Imobiliária">
              <Link
                href={`/vitrine/${currentTenant.slug}`}
                className="nav-link"
                onClick={() => setMenuOpen(false)}
              >
                <ShopWindow aria-hidden="true" />
                Vitrine de imóveis
                <ArrowUpRight
                  aria-hidden="true"
                  className="nav-external"
                  width={14}
                  height={14}
                />
              </Link>
            </nav>
          </div>
        </div>
      </aside>
      <div className="app-main">
        <header className="app-topbar">
          <div className="breadcrumb">
            <strong>{pageLabel}</strong>
          </div>
          <div className="topbar-details">
            <span className="tenant-label" title={currentTenant.name}>
              <Building width={15} height={15} aria-hidden="true" />
              <span>{currentTenant.name}</span>
            </span>
            <AccountMenu
              user={currentUser}
              disabled={loggingOut}
              onLogout={async () => {
                if (loggingOut) return;
                setLoggingOut(true);
                setLogoutError("");
                try {
                  const response = await fetch("/api/auth", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "LOGOUT" }),
                  });
                  if (!response.ok) throw new Error();
                  await queryClient.cancelQueries();
                  queryClient.clear();
                  logout();
                  setMenuOpen(false);
                  router.push("/login");
                  router.refresh();
                } catch {
                  setLogoutError("Não foi possível sair. Tente novamente.");
                } finally {
                  setLoggingOut(false);
                }
              }}
            />
          </div>
        </header>
        <main id="main-content" className="app-content" tabIndex={-1}>
          {logoutError && (
            <p role="alert" className="mb-4 text-sm text-red-600">
              {logoutError}
            </p>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
