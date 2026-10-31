import { notFound, redirect } from "next/navigation";
import { AppError } from "@/server/errors";
import { salonRoleHas } from "@/server/rbac/permissions";
import { getSalon, listMembers } from "@/server/salons/service";
import { getCurrentUser, getDictionary } from "@/server/web";
import { ActionForm } from "../../_components/ActionForm";
import { addMemberAction, renameSalonAction, updateMemberAction } from "../../actions";
import { SalonTabs } from "./SalonTabs";

export default async function SalonPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { id } = await params;
  const dict = await getDictionary();

  let data: Awaited<ReturnType<typeof getSalon>>;
  try {
    data = await getSalon(user, id);
  } catch (e) {
    if (e instanceof AppError && (e.code === "NOT_FOUND" || e.code === "FORBIDDEN")) notFound();
    throw e;
  }
  const { salon, role } = data;
  // UI hints only — every action is re-authorised on the server.
  const canManageProfile = role ? salonRoleHas(role, "salon.profile.manage") : false;
  const canReadMembers = role ? salonRoleHas(role, "salon.members.read") : true; // platform staff: read-only view
  const canManageMembers = role ? salonRoleHas(role, "salon.members.manage") : false;
  const members = canReadMembers ? await listMembers(user, id) : [];
  const assignable = role === "OWNER" ? (["OWNER", "MANAGER", "STAFF"] as const) : (["MANAGER", "STAFF"] as const);

  return (
    <section className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold" data-testid="salon-name">
          {salon.name}
        </h1>
        <p className="muted text-sm">
          {dict.salon.status}: {dict.enums[salon.status]} ·{" "}
          {role ? `${dict.salon.yourRole}: ${dict.enums[role]}` : dict.salon.platformView}
        </p>
      </div>
      <SalonTabs salonId={salon.id} current="overview" />

      {canManageProfile && (
        <ActionForm action={renameSalonAction} submitLabel={dict.salon.rename} className="card flex flex-wrap items-end gap-2">
          <input type="hidden" name="salonId" value={salon.id} />
          <input name="name" defaultValue={salon.name} required minLength={2} maxLength={120} className="input flex-1" />
        </ActionForm>
      )}

      {canReadMembers && (
        <div className="card flex flex-col gap-3">
          <h2 className="text-lg font-bold">{dict.salon.members}</h2>
          <div className="overflow-x-auto">
            <table className="grid-table" data-testid="members">
              <tbody>
                {members.map((m) => (
                  <tr key={m.id}>
                    <td>{m.user.name ?? "—"}</td>
                    <td dir="ltr">{m.user.phone}</td>
                    <td>{dict.enums[m.role]}</td>
                    <td>{dict.enums[m.status]}</td>
                    <td>
                      {canManageMembers && !(role === "MANAGER" && m.role === "OWNER") && (
                        <div className="flex flex-wrap gap-2">
                          <ActionForm action={updateMemberAction} submitLabel={dict.salon.changeRole}>
                            <input type="hidden" name="salonId" value={salon.id} />
                            <input type="hidden" name="membershipId" value={m.id} />
                            <select name="role" defaultValue={m.role} className="input">
                              {assignable.map((r) => (
                                <option key={r} value={r}>
                                  {dict.enums[r]}
                                </option>
                              ))}
                            </select>
                          </ActionForm>
                          <ActionForm
                            action={updateMemberAction}
                            submitLabel={m.status === "ACTIVE" ? dict.salon.disable : dict.salon.enable}
                          >
                            <input type="hidden" name="salonId" value={salon.id} />
                            <input type="hidden" name="membershipId" value={m.id} />
                            <input type="hidden" name="status" value={m.status === "ACTIVE" ? "DISABLED" : "ACTIVE"} />
                          </ActionForm>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {canManageMembers && (
            <ActionForm action={addMemberAction} submitLabel={dict.salon.add} testId="add-member-form">
              <input type="hidden" name="salonId" value={salon.id} />
              <label className="flex flex-col gap-1">
                <span className="text-sm">{dict.salon.memberPhone}</span>
                <input name="phone" type="tel" dir="ltr" required className="input" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-sm">{dict.salon.role}</span>
                <select name="role" defaultValue="STAFF" className="input">
                  {assignable.map((r) => (
                    <option key={r} value={r}>
                      {dict.enums[r]}
                    </option>
                  ))}
                </select>
              </label>
            </ActionForm>
          )}
        </div>
      )}
    </section>
  );
}
