import Link from "next/link";
import { redirect } from "next/navigation";
import { listMyNotifications } from "@/server/notifications/service";
import { getCurrentUser, getDict2, getLocale } from "@/server/web";
import { fmtDateTime } from "../_components/format";
import { markNotificationsReadAction } from "../actions2";

export default async function NotificationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const [t, locale, items] = await Promise.all([getDict2(), getLocale(), listMyNotifications(user)]);
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">{t.notif.title}</h1>
      <p className="muted text-xs">{t.notif.channel}</p>
      <form action={markNotificationsReadAction}>
        <button className="btn-ghost">{t.notif.markRead}</button>
      </form>
      {items.length === 0 ? (
        <p className="muted">{t.notif.empty}</p>
      ) : (
        <ul className="flex flex-col gap-2" data-testid="notifications">
          {items.map((n) => {
            const p = n.payload as { bookingId?: string; number?: string };
            return (
              <li key={n.id} className={`card text-sm ${n.readAt ? "muted" : "font-medium"}`}>
                {fmtDateTime(n.createdAt, locale)} — {t.notif.types[n.type] ?? n.type}{" "}
                {p.bookingId && (
                  <Link href={`/bookings/${p.bookingId}`} className="underline" dir="ltr">
                    {p.number ?? ""}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
