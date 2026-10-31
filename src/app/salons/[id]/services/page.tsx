import { listCategories, listSalonServices } from "@/server/catalog/service";
import { salonRoleHas } from "@/server/rbac/permissions";
import { getDict2, getLocale } from "@/server/web";
import { ActionForm } from "../../../_components/ActionForm";
import { formatSar } from "../../../_components/format";
import { createServiceAction, updateServiceAction } from "../../../actions2";
import { loadSalon } from "../guard";
import { SalonTabs } from "../SalonTabs";

export default async function ServicesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, salon, role } = await loadSalon(id);
  const [t, locale, services, categories] = await Promise.all([getDict2(), getLocale(), listSalonServices(user, id), listCategories({ activeOnly: true })]);
  const canManage = role ? salonRoleHas(role, "salon.services.manage") : false;
  const n = (x: { nameAr: string; nameEn: string }) => (locale === "ar" ? x.nameAr : x.nameEn);

  return (
    <section className="flex flex-col gap-5">
      <h1 className="text-2xl font-bold">{salon.name}</h1>
      <SalonTabs salonId={id} current="services" />
      <div className="card overflow-x-auto">
        {services.length === 0 ? (
          <p className="muted text-sm">{t.salon.noServices}</p>
        ) : (
          <table className="grid-table" data-testid="services">
            <tbody>
              {services.map((s) => (
                <tr key={s.id}>
                  <td>
                    <div className="font-medium">{n(s)}</div>
                    <div className="muted">{n(s.category)}</div>
                  </td>
                  <td>
                    {s.durationMinutes} {t.common.minutes}
                  </td>
                  <td>{formatSar(s.priceHalalas, locale)}</td>
                  <td>{s.active ? t.common.active : t.common.inactive}</td>
                  <td>
                    {canManage && (
                      <div className="flex flex-wrap gap-2">
                        <ActionForm action={updateServiceAction} submitLabel={t.common.save}>
                          <input type="hidden" name="salonId" value={id} />
                          <input type="hidden" name="serviceId" value={s.id} />
                          <input name="priceSar" type="number" min={0} step="0.01" defaultValue={s.priceHalalas / 100} className="input w-24" aria-label={t.salon.price} />
                          <input name="durationMinutes" type="number" min={5} max={720} defaultValue={s.durationMinutes} className="input w-20" aria-label={t.salon.duration} />
                        </ActionForm>
                        <ActionForm action={updateServiceAction} submitLabel={s.active ? t.common.disable : t.common.enable}>
                          <input type="hidden" name="salonId" value={id} />
                          <input type="hidden" name="serviceId" value={s.id} />
                          <input type="hidden" name="active" value={s.active ? "false" : "true"} />
                        </ActionForm>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {canManage && (
        <ActionForm action={createServiceAction} submitLabel={t.common.add} className="card grid gap-2 sm:grid-cols-3" testId="service-form">
          <h2 className="font-bold sm:col-span-3">{t.salon.addService}</h2>
          <input type="hidden" name="salonId" value={id} />
          <label className="flex flex-col gap-1 text-sm">
            {t.salon.category}
            <select name="categoryId" required className="input">
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {n(c)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t.salon.nameAr}
            <input name="nameAr" required minLength={2} maxLength={120} className="input" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t.salon.nameEn}
            <input name="nameEn" required minLength={2} maxLength={120} dir="ltr" className="input" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t.salon.duration}
            <input name="durationMinutes" type="number" min={5} max={720} defaultValue={60} required className="input" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t.salon.price}
            <input name="priceSar" type="number" min={0} step="0.01" required className="input" />
          </label>
        </ActionForm>
      )}
    </section>
  );
}
