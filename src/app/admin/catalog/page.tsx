import { notFound, redirect } from "next/navigation";
import { listCategories } from "@/server/catalog/service";
import { listCities } from "@/server/geo/service";
import { hasPlatformPermission } from "@/server/rbac/authorize";
import { getCurrentUser, getDictionary, getDict2, getLocale } from "@/server/web";
import { ActionForm } from "../../_components/ActionForm";
import { categoryActiveAction, createCategoryAction, createCityAction, createDistrictAction } from "../../actions2";
import { AdminNav } from "../AdminNav";

export default async function CatalogAdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!hasPlatformPermission(user, "platform.catalog.manage")) notFound();
  const [t, dict, locale, categories, cities] = await Promise.all([getDict2(), getDictionary(), getLocale(), listCategories(), listCities()]);
  const n = (x: { nameAr: string; nameEn: string }) => (locale === "ar" ? x.nameAr : x.nameEn);

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">{dict.admin.title}</h1>
      <AdminNav actor={user} current="catalog" />

      <div className="card flex flex-col gap-3">
        <h2 className="text-lg font-bold">{t.admin.categories}</h2>
        <table className="grid-table" data-testid="categories">
          <tbody>
            {categories.map((c) => (
              <tr key={c.id}>
                <td>{n(c)}</td>
                <td dir="ltr">{c.slug}</td>
                <td>{c.active ? t.common.active : t.common.inactive}</td>
                <td>
                  <ActionForm action={categoryActiveAction} submitLabel={c.active ? t.common.disable : t.common.enable}>
                    <input type="hidden" name="categoryId" value={c.id} />
                    <input type="hidden" name="active" value={c.active ? "false" : "true"} />
                  </ActionForm>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <ActionForm action={createCategoryAction} submitLabel={t.admin.addCategory} testId="category-form">
          <input name="nameAr" required placeholder={t.admin.nameAr} className="input" />
          <input name="nameEn" required placeholder={t.admin.nameEn} dir="ltr" className="input" />
          <input name="slug" required pattern="[a-z0-9-]{2,40}" placeholder={t.admin.slug} dir="ltr" className="input" />
          <input name="sortOrder" type="number" min={0} defaultValue={0} aria-label={t.admin.sortOrder} className="input w-20" />
        </ActionForm>
      </div>

      <div className="card flex flex-col gap-3">
        <h2 className="text-lg font-bold">{t.admin.cities}</h2>
        <ul className="text-sm" data-testid="cities">
          {cities.map((c) => (
            <li key={c.id}>
              <strong>{n(c)}</strong>: {c.districts.map((d) => n(d)).join("، ") || "—"}
            </li>
          ))}
        </ul>
        <ActionForm action={createCityAction} submitLabel={t.admin.addCity} testId="city-form">
          <input name="nameAr" required placeholder={t.admin.nameAr} className="input" />
          <input name="nameEn" required placeholder={t.admin.nameEn} dir="ltr" className="input" />
        </ActionForm>
        {cities.length > 0 && (
          <ActionForm action={createDistrictAction} submitLabel={t.admin.addDistrict} testId="district-form">
            <select name="cityId" required className="input" aria-label={t.admin.city}>
              {cities.map((c) => (
                <option key={c.id} value={c.id}>
                  {n(c)}
                </option>
              ))}
            </select>
            <input name="nameAr" required placeholder={t.admin.nameAr} className="input" />
            <input name="nameEn" required placeholder={t.admin.nameEn} dir="ltr" className="input" />
          </ActionForm>
        )}
      </div>
    </section>
  );
}
