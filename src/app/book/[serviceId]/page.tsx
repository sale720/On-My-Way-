import Link from "next/link";
import { redirect } from "next/navigation";
import { getOfferSlots } from "@/server/bookings/search";
import { addDays, isDateStr, riyadhDate } from "@/server/time";
import { getCurrentUser, getDict2, getLocale } from "@/server/web";
import { fmtDay, fmtTime } from "../../_components/format";

export default async function SlotsPage({
  params,
  searchParams,
}: {
  params: Promise<{ serviceId: string }>;
  searchParams: Promise<{ addressId?: string; date?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const [{ serviceId }, sp, t, locale] = await Promise.all([params, searchParams, getDict2(), getLocale()]);
  if (!sp.addressId) redirect("/book");
  const today = riyadhDate(new Date());
  const date = sp.date && isDateStr(sp.date) ? sp.date : addDays(today, 1);
  const res = await getOfferSlots(user, { salonServiceId: serviceId, addressId: sp.addressId, date });
  const days = Array.from({ length: Math.min(14, res.ev.salon.maxAdvanceDays + 1) }, (_, i) => addDays(today, i));
  const n = locale === "ar" ? res.ev.service.nameAr : res.ev.service.nameEn;

  return (
    <section className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold">{n}</h1>
        <p className="muted text-sm">
          {res.ev.salon.name} · {res.ev.service.durationMinutes} {t.common.minutes}
        </p>
      </div>
      {!res.eligible ? (
        <p className="card">{t.reasons[res.reason!]}</p>
      ) : (
        <>
          <h2 className="font-bold">{t.book.chooseDate}</h2>
          <div className="flex flex-wrap gap-2" data-testid="days">
            {days.map((d) => (
              <Link
                key={d}
                href={`/book/${serviceId}?addressId=${sp.addressId}&date=${d}`}
                className={d === date ? "btn" : "btn-ghost"}
                aria-current={d === date ? "date" : undefined}
              >
                {fmtDay(d, locale)}
              </Link>
            ))}
          </div>
          <h2 className="font-bold">{t.book.chooseTime}</h2>
          {res.slots.length === 0 ? (
            <p className="muted">{t.book.noSlots}</p>
          ) : (
            <div className="flex flex-wrap gap-2" data-testid="slots">
              {res.slots.map((s) => (
                <Link key={s.toISOString()} href={`/book/${serviceId}/confirm?addressId=${sp.addressId}&start=${encodeURIComponent(s.toISOString())}`} className="btn-ghost" dir="ltr">
                  {fmtTime(s, locale)}
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
