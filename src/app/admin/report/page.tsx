import { notFound, redirect } from "next/navigation";
import { hasPlatformPermission } from "@/server/rbac/authorize";
import { platformReport } from "@/server/reports/service";
import { getCurrentUser, getDictionary, getDict2, getLocale } from "@/server/web";
import { formatSar } from "../../_components/format";
import { AdminNav } from "../AdminNav";

export default async function ReportPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!hasPlatformPermission(user, "platform.reports.read")) notFound();
  const [t, dict, locale, r] = await Promise.all([getDict2(), getDictionary(), getLocale(), platformReport(user)]);
  const tiles = [
    [t.admin.gmv, formatSar(r.completedGmvHalalas, locale)],
    [t.admin.commissionTotal, formatSar(r.commissionHalalas, locale)],
    [t.admin.cash, formatSar(r.cashCollectedHalalas, locale)],
    [t.admin.last30, String(r.last30DaysCreated)],
    [t.admin.completion, r.completionRate === null ? "—" : `${Math.round(r.completionRate * 100)}%`],
    [t.admin.activeSalons, String(r.activeSalons)],
    [t.admin.users, String(r.users)],
  ];
  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">{dict.admin.title}</h1>
      <AdminNav actor={user} current="report" />
      <h2 className="text-lg font-bold">{t.admin.report}</h2>
      <div className="grid gap-3 sm:grid-cols-3" data-testid="report">
        {tiles.map(([label, value]) => (
          <div key={label} className="card">
            <div className="muted text-sm">{label}</div>
            <div className="text-xl font-bold">{value}</div>
          </div>
        ))}
      </div>
      <div className="card text-sm">
        <h3 className="font-bold">{t.admin.byStatus}</h3>
        <ul>
          {Object.entries(r.bookingsByStatus).map(([s, c]) => (
            <li key={s}>
              {t.status[s] ?? s}: {c}
            </li>
          ))}
        </ul>
      </div>
      <p className="muted text-xs">{t.admin.definitions}</p>
    </section>
  );
}
