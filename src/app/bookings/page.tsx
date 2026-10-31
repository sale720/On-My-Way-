import Link from "next/link";
import { redirect } from "next/navigation";
import { listMyBookings } from "@/server/bookings/service";
import { getCurrentUser, getDict2, getLocale } from "@/server/web";
import { fmtDateTime, formatSar } from "../_components/format";

export default async function BookingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const [t, locale, bookings] = await Promise.all([getDict2(), getLocale(), listMyBookings(user)]);
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">{t.nav.bookings}</h1>
      {bookings.length === 0 ? (
        <p className="muted">{t.booking.empty}</p>
      ) : (
        <ul className="flex flex-col gap-2" data-testid="my-bookings">
          {bookings.map((b) => (
            <li key={b.id} className="card flex flex-wrap items-center gap-3">
              <Link href={`/bookings/${b.id}`} className="font-bold underline" dir="ltr">
                {b.number}
              </Link>
              <span>{locale === "ar" ? b.items[0]?.nameAr : b.items[0]?.nameEn}</span>
              <span className="muted text-sm">{b.salon.name}</span>
              <span className="text-sm">{fmtDateTime(b.startsAt, locale)}</span>
              <span className="text-sm">{formatSar(b.totalHalalas, locale)}</span>
              <span className="text-sm font-medium" data-testid="status">
                {t.status[b.status]}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
