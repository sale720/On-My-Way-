import { redirect } from "next/navigation";
import { listCities, listMyAddresses } from "@/server/geo/service";
import { getCurrentUser, getDict2, getLocale } from "@/server/web";
import { ActionForm } from "../_components/ActionForm";
import { createAddressAction, deleteAddressAction } from "../actions2";

export default async function AddressesPage({ searchParams }: { searchParams: Promise<{ back?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const [t, locale, addresses, cities, { back }] = await Promise.all([getDict2(), getLocale(), listMyAddresses(user), listCities({ activeOnly: true }), searchParams]);
  const n = (x: { nameAr: string; nameEn: string }) => (locale === "ar" ? x.nameAr : x.nameEn);
  const districts = cities.flatMap((c) => c.districts.map((d) => ({ id: d.id, label: `${n(c)} — ${n(d)}` })));

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">{t.address.title}</h1>
      <div className="card flex flex-col gap-2">
        {addresses.length === 0 ? (
          <p className="muted text-sm">{t.address.empty}</p>
        ) : (
          <ul className="flex flex-col gap-2" data-testid="addresses">
            {addresses.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{a.label ?? n(a.district)}</span>
                <span className="muted text-sm">
                  {n(a.district.city)} — {n(a.district)} · {a.street}
                </span>
                <ActionForm action={deleteAddressAction} submitLabel={t.common.delete} className="inline-flex gap-2">
                  <input type="hidden" name="addressId" value={a.id} />
                </ActionForm>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card flex flex-col gap-3">
        <h2 className="text-lg font-bold">{t.address.add}</h2>
        <p className="muted text-xs">{t.address.privacy}</p>
        {districts.length === 0 ? (
          <p className="muted text-sm">{t.address.noDistricts}</p>
        ) : (
          <ActionForm action={createAddressAction} submitLabel={t.common.save} className="grid gap-2 sm:grid-cols-2" testId="address-form">
            <input type="hidden" name="back" value={back ?? ""} />
            <label className="flex flex-col gap-1 text-sm">
              {t.address.district}
              <select name="districtId" required className="input">
                {districts.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              {t.address.label}
              <input name="label" maxLength={40} className="input" />
            </label>
            <label className="flex flex-col gap-1 text-sm sm:col-span-2">
              {t.address.street}
              <input name="street" required minLength={3} maxLength={200} className="input" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              {t.address.building}
              <input name="building" maxLength={40} className="input" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              {t.address.floor}
              <input name="floor" maxLength={20} className="input" />
            </label>
            <label className="flex flex-col gap-1 text-sm sm:col-span-2">
              {t.address.instructions}
              <input name="instructions" maxLength={300} className="input" />
            </label>
          </ActionForm>
        )}
      </div>
    </section>
  );
}
