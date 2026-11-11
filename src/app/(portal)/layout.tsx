import { redirect } from "next/navigation";
import { requirePageSession } from "@/server/services/auth.service";
import { PortalSession } from "@/components/layout/portal-session";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const session = await requirePageSession();
  if (!session) redirect("/login");
  return <PortalSession session={session}>{children}</PortalSession>;
}
