import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { PlatformRole } from "@prisma/client";
import { hasPlatformPermission } from "@/server/rbac/authorize";
import { listAllSalons } from "@/server/salons/service";
import { listAuditLog, listUsers } from "@/server/users/service";
import { getCurrentUser, getDictionary, getLocale } from "@/server/web";
import { ActionForm } from "../_components/ActionForm";
import { changeRoleAction, setSalonStatusAction, setUserStatusAction } from "../actions";

const ROLES: PlatformRole[] = ["CUSTOMER", "PROVIDER", "SUPPORT_AGENT", "PLATFORM_ADMIN"];

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // Page visibility mirrors server rules; each data call below re-checks its own permission.
  if (!hasPlatformPermission(user, "platform.users.read")) notFound();

  const [dict, locale, { q }] = await Promise.all([getDictionary(), getLocale(), searchParams]);
  const canManageUsers = hasPlatformPermission(user, "platform.users.manage");
  const canManageRoles = hasPlatformPermission(user, "platform.roles.manage");
  const canManageSalons = hasPlatformPermission(user, "platform.salons.manage");
  const canReadAudit = hasPlatformPermission(user, "platform.audit.read");

  const [users, salons, audit] = await Promise.all([
    listUsers(user, { q }),
    listAllSalons(user),
    canReadAudit ? listAuditLog(user, { take: 50 }) : Promise.resolve([]),
  ]);
  const fmt = new Intl.DateTimeFormat(locale === "ar" ? "ar-SA" : "en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Riyadh",
  });

  return (
    <section className="flex flex-col gap-8">
      <h1 className="text-2xl font-bold">{dict.admin.title}</h1>

      <div className="card flex flex-col gap-3">
        <h2 className="text-lg font-bold">{dict.admin.users}</h2>
        <form className="flex gap-2">
          <input name="q" defaultValue={q} placeholder={dict.admin.search} className="input flex-1" />
          <button className="btn-ghost">{dict.admin.apply}</button>
        </form>
        <div className="overflow-x-auto">
          <table className="grid-table" data-testid="users">
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>
                    <div>{u.name ?? "—"}</div>
                    <div dir="ltr" className="muted">
                      {u.phone}
                    </div>
                  </td>
                  <td>{dict.enums[u.status]}</td>
                  <td>{u.roles.map((r) => dict.enums[r]).join("، ")}</td>
                  <td className="flex flex-col gap-2">
                    {canManageUsers && u.id !== user.id && (
                      <ActionForm
                        action={setUserStatusAction}
                        submitLabel={u.status === "ACTIVE" ? dict.admin.suspend : dict.admin.activate}
                      >
                        <input type="hidden" name="userId" value={u.id} />
                        <input type="hidden" name="status" value={u.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE"} />
                        <input name="reason" required minLength={3} placeholder={dict.admin.reason} className="input" />
                      </ActionForm>
                    )}
                    {canManageRoles && (
                      <ActionForm action={changeRoleAction} submitLabel={dict.admin.apply}>
                        <input type="hidden" name="userId" value={u.id} />
                        <select name="op" className="input">
                          <option value="grant">{dict.admin.grant}</option>
                          <option value="revoke">{dict.admin.revoke}</option>
                        </select>
                        <select name="role" className="input">
                          {ROLES.map((r) => (
                            <option key={r} value={r}>
                              {dict.enums[r]}
                            </option>
                          ))}
                        </select>
                        <input name="reason" required minLength={3} placeholder={dict.admin.reason} className="input" />
                      </ActionForm>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card flex flex-col gap-3">
        <h2 className="text-lg font-bold">{dict.admin.salons}</h2>
        <div className="overflow-x-auto">
          <table className="grid-table" data-testid="salons">
            <tbody>
              {salons.map((s) => (
                <tr key={s.id}>
                  <td>
                    <Link href={`/salons/${s.id}`} className="underline">
                      {s.name}
                    </Link>
                  </td>
                  <td>{dict.enums[s.status]}</td>
                  <td>{s._count.memberships}</td>
                  <td>
                    {canManageSalons && (
                      <ActionForm action={setSalonStatusAction} submitLabel={dict.admin.apply}>
                        <input type="hidden" name="salonId" value={s.id} />
                        <select name="status" defaultValue={s.status} className="input">
                          {(["PENDING_REVIEW", "ACTIVE", "SUSPENDED"] as const).map((st) => (
                            <option key={st} value={st}>
                              {dict.enums[st]}
                            </option>
                          ))}
                        </select>
                        <input name="reason" required minLength={3} placeholder={dict.admin.reason} className="input" />
                      </ActionForm>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {canReadAudit && (
        <div className="card flex flex-col gap-3">
          <h2 className="text-lg font-bold">{dict.admin.audit}</h2>
          <div className="overflow-x-auto">
            <table className="grid-table" data-testid="audit">
              <thead>
                <tr>
                  <th>{dict.admin.when}</th>
                  <th>{dict.admin.actor}</th>
                  <th>{dict.admin.action}</th>
                  <th>{dict.admin.target}</th>
                </tr>
              </thead>
              <tbody>
                {audit.map((a) => (
                  <tr key={a.id}>
                    <td>{fmt.format(a.createdAt)}</td>
                    <td>{a.actor ? (a.actor.name ?? a.actor.id.slice(0, 8)) : dict.admin.system}</td>
                    <td dir="ltr">{a.action}</td>
                    <td>
                      <span dir="ltr">
                        {a.targetType}:{a.targetId.slice(0, 8)}
                      </span>
                      {a.reason && <div className="muted">{a.reason}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
