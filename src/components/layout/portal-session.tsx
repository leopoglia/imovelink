"use client";
import { useEffect, useState } from "react";
import { useTenantStore } from "@/store/tenant-store";
import { AppShell } from "./app-shell";
import type { AccountSettings } from "@/types/domain";
import { useQueryClient } from "@tanstack/react-query";

export function PortalSession({
  session,
  children,
}: {
  session: AccountSettings;
  children: React.ReactNode;
}) {
  const [ready, setReady] = useState(false);
  const queryClient = useQueryClient();
  useEffect(() => {
    queryClient.clear();
    useTenantStore.getState().syncSession(session.user, session.tenant);
    setReady(true);
  }, [session, queryClient]);
  if (!ready)
    return (
      <div role="status" className="p-8 text-sm text-slate-500">
        Carregando…
      </div>
    );
  return <AppShell>{children}</AppShell>;
}
