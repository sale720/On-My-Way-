import Link from "next/link";
import { hasPlatformPermission, type Actor } from "@/server/rbac/authorize";
import { getDict2 } from "@/server/web";

export async function AdminNav({ actor, current }: { actor: Actor; current: "home" | "catalog" | "settings" | "report" }) {
  const t = await getDict2();
  const links = [
    ["home", "/admin", hasPlatformPermission(actor, "platform.users.read")],
    ["catalog", "/admin/catalog", hasPlatformPermission(actor, "platform.catalog.manage")],
    ["settings", "/admin/settings", hasPlatformPermission(actor, "platform.settings.manage")],
    ["report", "/admin/report", hasPlatformPermission(actor, "platform.reports.read")],
  ] as const;
  return (
    <nav className="flex flex-wrap gap-2 text-sm" data-testid="admin-nav">
      {links
        .filter(([, , ok]) => ok)
        .map(([k, href]) => (
          <Link key={k} href={href} className={k === current ? "btn" : "btn-ghost"}>
            {t.admin.links[k]}
          </Link>
        ))}
    </nav>
  );
}
