import Link from "next/link";
import { redirect } from "next/navigation";
import { listMySalons } from "@/server/salons/service";
import { getCurrentUser, getDictionary } from "@/server/web";
import { ActionForm } from "../_components/ActionForm";
import { createSalonAction, updateProfileAction } from "../actions";

export default async function AccountPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const [dict, salons] = await Promise.all([getDictionary(), listMySalons(user)]);

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">{dict.account.title}</h1>

      <div className="card flex flex-col gap-3">
        <p dir="ltr" className="self-start" data-testid="account-phone">
          {user.phone}
        </p>
        <ActionForm action={updateProfileAction} submitLabel={dict.account.save} testId="profile-form">
          <label className="flex flex-col gap-1">
            <span className="text-sm">{dict.account.name}</span>
            <input name="name" defaultValue={user.name ?? ""} maxLength={80} className="input" />
          </label>
        </ActionForm>
        <p className="text-sm">
          {dict.account.roles}: <span data-testid="account-roles">{user.roles.map((r) => dict.enums[r] ?? r).join("، ")}</span>
        </p>
      </div>

      <div className="card flex flex-col gap-3">
        <h2 className="text-lg font-bold">{dict.account.mySalons}</h2>
        {salons.length === 0 ? (
          <p className="muted text-sm">{dict.account.noSalons}</p>
        ) : (
          <ul className="flex flex-col gap-1" data-testid="my-salons">
            {salons.map(({ salon, role }) => (
              <li key={salon.id}>
                <Link href={`/salons/${salon.id}`} className="underline">
                  {salon.name}
                </Link>{" "}
                <span className="muted text-sm">
                  — {dict.enums[role]} · {dict.enums[salon.status]}
                </span>
              </li>
            ))}
          </ul>
        )}
        <ActionForm action={createSalonAction} submitLabel={dict.account.create} testId="create-salon-form">
          <label className="flex flex-col gap-1">
            <span className="text-sm">{dict.account.createSalon}</span>
            <input name="name" required minLength={2} maxLength={120} placeholder={dict.account.salonName} className="input" />
          </label>
        </ActionForm>
      </div>
    </section>
  );
}
