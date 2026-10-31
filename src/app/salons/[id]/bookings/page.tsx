import Link from "next/link";
import { listSalonBookings } from "@/server/bookings/service";
import { getDict2, getLocale } from "@/server/web";
import { fmtDateTime, formatSar } from "../../../_components/format";
import { loadSalon } from "../guard";
import { SalonTabs } from "../SalonTabs";

export default async function SalonBookingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, salon } = await loadSalon(id);
  const [t, locale, bookings] = await Promise.all([getDict2(), getLocale(), listSalonBookings(user, id)]);
  return (
    <section className="flex flex-col gap-5">
      <h1 className="text-2xl font-bold">{salon.name}</h1>
      <SalonTabs salonId={id} current="bookings" />
      {bookings.length === 0 ? (
        <p className="muted">{t.booking.empty}</p>
      ) : (
        <div className="card overflow-x-auto">
          <table className="grid-table" data-testid="salon-bookings">
            <tbody>
              {bookings.map((b) => (
                <tr key={b.id}>
                  <td>
                    <Link href={`/bookings/${b.id}`} className="underline" dir="ltr">
                      {b.number}
                    </Link>
                  </td>
                  <td>{fmtDateTime(b.startsAt, locale)}</td>
                  <td>{locale === "ar" ? b.items[0]?.nameAr : b.items[0]?.nameEn}</td>
                  <td>{locale === "ar" ? b.addrDistrictAr : b.addrDistrictEn}</td>
                  <td>{b.staff.user.name ?? b.staff.user.phone}</td>
                  <td>{formatSar(b.totalHalalas, locale)}</td>
                  <td>{t.status[b.status]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
