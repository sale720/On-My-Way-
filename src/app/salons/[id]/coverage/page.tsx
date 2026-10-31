import { listCities, listSalonCoverage } from "@/server/geo/service";
import { salonRoleHas } from "@/server/rbac/permissions";
import { getDict2, getLocale } from "@/server/web";
import { ActionForm } from "../../../_components/ActionForm";
import { formatSar } from "../../../_components/format";
import { coverageAction } from "../../../actions2";
import { loadSalon } from "../guard";
import { SalonTabs } from "../SalonTabs";

export default async function CoveragePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, salon, role } = await loadSalon(id);
  const [t, locale, areas, cities] = await Promise.all([getDict2(), getLocale(), listSalonCoverage(user, id), listCities({ activeOnly: true })]);
  const canManage = role ? salonRoleHas(role, "salon.coverage.manage") : false;
  const n = (x: { nameAr: string; nameEn: string }) => (locale === "ar" ? x.nameAr : x.nameEn);

  return (
    <section className="flex flex-col gap-5">
      <h1 className="text-2xl font-bold">{salon.name}</h1>
      <SalonTabs salonId={id} current="coverage" />
      <p className="muted text-sm">{t.salon.coverageNote}</p>
      <div className="card overflow-x-auto">
        {areas.length === 0 ? (
          <p className="muted text-sm">{t.salon.noCoverage}</p>
        ) : (
          <table className="grid-table" data-testid="coverage">
            <tbody>
              {areas.map((a) => (
                <tr key={a.id}>
                  <td>
                    {n(a.district.city)} — {n(a.district)}
                  </td>
                  <td>{formatSar(a.travelFeeHalalas, locale)}</td>
                  <td>{a.active ? t.common.active : t.common.inactive}</td>
                  <td>
                    {canManage && (
                      <ActionForm action={coverageAction} submitLabel={a.active ? t.common.disable : t.common.enable}>
                        <input type="hidden" name="salonId" value={id} />
                        <input type="hidden" name="districtId" value={a.districtId} />
                        <input type="hidden" name="travelFeeSar" value={a.travelFeeHalalas / 100} />
                        <input type="hidden" name="active" value={a.active ? "false" : "true"} />
                      </ActionForm>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {canManage && (
        <ActionForm action={coverageAction} submitLabel={t.common.save} className="card flex flex-wrap items-end gap-2" testId="coverage-form">
          <input type="hidden" name="salonId" value={id} />
          <label className="flex flex-col gap-1 text-sm">
            {t.address.district}
            <select name="districtId" required className="input">
              {cities.flatMap((c) =>
                c.districts.map((d) => (
                  <option key={d.id} value={d.id}>
                    {n(c)} — {n(d)}
                  </option>
                )),
              )}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t.salon.travelFee}
            <input name="travelFeeSar" type="number" min={0} step="0.01" defaultValue={0} required className="input w-28" />
          </label>
        </ActionForm>
      )}
    </section>
  );
}
