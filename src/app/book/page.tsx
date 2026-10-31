import Link from "next/link";
import { redirect } from "next/navigation";
import { listCategories } from "@/server/catalog/service";
import { listMyAddresses } from "@/server/geo/service";
import { findOffers } from "@/server/bookings/search";
import { db } from "@/server/db";
import { addDays, riyadhDate } from "@/server/time";
import { getCurrentUser, getDict2, getLocale } from "@/server/web";
import { fmtDateTime, formatSar } from "../_components/format";

export default async function BookPage({ searchParams }: { searchParams: Promise<{ addressId?: string; categoryId?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const [t, locale, sp] = await Promise.all([getDict2(), getLocale(), searchParams]);
  const [addresses, categories] = await Promise.all([listMyAddresses(user), listCategories({ activeOnly: true })]);
  const n = (x: { nameAr: string; nameEn: string }) => (locale === "ar" ? x.nameAr : x.nameEn);

  if (addresses.length === 0) {
    return (
      <section className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold">{t.book.title}</h1>
        <p>{t.book.needAddress}</p>
        <Link href="/addresses?back=/book" className="btn self-start">
          {t.address.add}
        </Link>
      </section>
    );
  }

  const addressId = sp.addressId ?? addresses[0].id;
  const categoryId = sp.categoryId;
  const result = categoryId ? await findOffers(user, { addressId, categoryId }) : null;
  const excludedNames = result?.excluded.length
    ? await db.salonService.findMany({ where: { id: { in: result.excluded.map((e) => e.salonServiceId) } }, include: { salon: { select: { name: true } } } })
    : [];
  const tomorrow = addDays(riyadhDate(new Date()), 1);

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">{t.book.title}</h1>
      <form className="card grid gap-3 sm:grid-cols-3" data-testid="search-form">
        <label className="flex flex-col gap-1 text-sm">
          {t.book.address}
          <select name="addressId" defaultValue={addressId} className="input">
            {addresses.map((a) => (
              <option key={a.id} value={a.id}>
                {(a.label ? `${a.label} — ` : "") + `${n(a.district)}، ${a.street}`}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {t.book.category}
          <select name="categoryId" defaultValue={categoryId} required className="input">
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {n(c)}
              </option>
            ))}
          </select>
        </label>
        <button className="btn self-end">{t.book.search}</button>
      </form>
      {categories.length === 0 && <p className="muted">{t.book.noCategories}</p>}

      {result && (
        <div className="flex flex-col gap-3" data-testid="offers">
          {result.offers.length === 0 && <p className="card">{t.book.noOffers}</p>}
          {result.offers.map((o) => (
            <article key={o.salonServiceId} className="card flex flex-wrap items-center gap-4" data-testid="offer">
              <div className="flex-1">
                <h2 className="font-bold">{locale === "ar" ? o.serviceNameAr : o.serviceNameEn}</h2>
                <p className="muted text-sm">
                  {o.salonName} · {o.durationMinutes} {t.common.minutes} ·{" "}
                  {o.rating.count ? `★ ${o.rating.avg?.toFixed(1)} (${o.rating.count} ${t.book.reviews})` : t.book.ratingNone}
                </p>
                <p className="text-sm">
                  {t.book.earliest}: {fmtDateTime(o.earliest, locale)}
                </p>
              </div>
              <div className="text-sm">
                <div>
                  {t.book.subtotal}: {formatSar(o.quote.subtotalHalalas, locale)}
                </div>
                <div>
                  {t.book.travelFee}: {formatSar(o.quote.travelFeeHalalas, locale)}
                </div>
                {o.quote.vatHalalas > 0 && (
                  <div>
                    {t.book.vat}: {formatSar(o.quote.vatHalalas, locale)}
                  </div>
                )}
                <div className="font-bold">
                  {t.book.total}: {formatSar(o.quote.totalHalalas, locale)}
                </div>
              </div>
              <Link href={`/book/${o.salonServiceId}?addressId=${addressId}&date=${riyadhDate(o.earliest) ?? tomorrow}`} className="btn">
                {t.book.choose}
              </Link>
            </article>
          ))}
          {result.excluded.length > 0 && (
            <details className="card text-sm">
              <summary>
                {t.book.excluded} ({result.excluded.length})
              </summary>
              <ul className="mt-2" data-testid="excluded">
                {result.excluded.map((e) => {
                  const s = excludedNames.find((x) => x.id === e.salonServiceId);
                  return (
                    <li key={e.salonServiceId}>
                      {s ? `${s.salon.name} — ${n(s)}` : e.salonServiceId}: {t.reasons[e.reason]}
                    </li>
                  );
                })}
              </ul>
            </details>
          )}
        </div>
      )}
    </section>
  );
}
