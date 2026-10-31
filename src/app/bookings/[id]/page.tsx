import { notFound, redirect } from "next/navigation";
import { getBooking } from "@/server/bookings/service";
import { isAppError } from "@/server/errors";
import { getCurrentUser, getDict2, getLocale } from "@/server/web";
import { ActionForm } from "../../_components/ActionForm";
import { fmtDateTime, formatSar } from "../../_components/format";
import { recordCashAction, reviewAction, transitionAction } from "../../actions2";

export default async function BookingPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const [{ id }, t, locale] = await Promise.all([params, getDict2(), getLocale()]);
  let b: Awaited<ReturnType<typeof getBooking>>;
  try {
    b = await getBooking(user, id);
  } catch (e) {
    if (isAppError(e) && e.code === "NOT_FOUND") notFound();
    throw e;
  }
  const ar = locale === "ar";

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className="text-2xl font-bold" dir="ltr">
          {b.number}
        </h1>
        <span className="card px-3 py-1 text-sm font-medium" data-testid="booking-status" data-status={b.status}>
          {t.status[b.status]}
        </span>
      </div>

      <div className="card grid gap-1 text-sm sm:grid-cols-2">
        <div>
          {t.booking.when}: {fmtDateTime(b.startsAt, locale)}
        </div>
        <div>
          {t.booking.salon}: {b.salon.name}
        </div>
        <div>
          {t.booking.provider}: {b.staff.user.name ?? "—"}
        </div>
        <div>
          {t.booking.customer}: {b.customer.name ?? "—"}{" "}
          {b.customer.phone && (
            <span dir="ltr" className="muted">
              {b.customer.phone}
            </span>
          )}
        </div>
        <div className="sm:col-span-2" data-testid="booking-address">
          {t.booking.address}: {ar ? b.addrCityAr : b.addrCityEn} — {ar ? b.addrDistrictAr : b.addrDistrictEn}
          {b.addrStreet ? (
            <>
              ، {b.addrStreet}
              {b.addrBuilding && ` · ${b.addrBuilding}`}
              {b.addrFloor && ` · ${b.addrFloor}`}
              {b.addrInstructions && <div className="muted">{b.addrInstructions}</div>}
            </>
          ) : (
            <span className="muted"> ({t.booking.addressHidden})</span>
          )}
        </div>
        {b.notes && (
          <div className="sm:col-span-2">
            {t.booking.notes}: {b.notes}
          </div>
        )}
      </div>

      <div className="card text-sm">
        {b.items.map((i) => (
          <div key={i.id}>
            {ar ? i.nameAr : i.nameEn} · {i.durationMinutes} {t.common.minutes} · {formatSar(i.priceHalalas, locale)}
          </div>
        ))}
        <div>
          {t.book.travelFee}: {formatSar(b.travelFeeHalalas, locale)}
        </div>
        <div>
          {t.book.vat} ({b.vatBps / 100}%): {formatSar(b.vatHalalas, locale)}
        </div>
        <div className="font-bold">
          {t.book.total}: {formatSar(b.totalHalalas, locale)}
        </div>
        <div data-testid="payment">
          {t.booking.payment}: {t.pay[b.paymentMethod]} — {t.payStatus[b.paymentStatus]}
        </div>
      </div>

      {(b.nextActions.length > 0 || b.canRecordCash) && (
        <div className="card flex flex-col gap-2" data-testid="actions">
          <h2 className="font-bold">{t.booking.actions}</h2>
          {b.nextActions.map((a) => (
            <ActionForm key={a.to} action={transitionAction} submitLabel={t.transitions[a.to] ?? a.to} testId={`act-${a.to}`}>
              <input type="hidden" name="bookingId" value={b.id} />
              <input type="hidden" name="to" value={a.to} />
              {a.reasonRequired && <input name="reason" required minLength={3} placeholder={t.booking.reasonPlaceholder} className="input flex-1" />}
            </ActionForm>
          ))}
          {b.canRecordCash && (
            <ActionForm action={recordCashAction} submitLabel={t.booking.recordCash} testId="record-cash">
              <input type="hidden" name="bookingId" value={b.id} />
            </ActionForm>
          )}
        </div>
      )}

      {b.canReview && (
        <ActionForm action={reviewAction} submitLabel={t.booking.sendReview} className="card grid gap-2 sm:grid-cols-3" testId="review-form">
          <input type="hidden" name="bookingId" value={b.id} />
          {(["rating", "punctuality", "quality"] as const).map((k) => (
            <label key={k} className="flex flex-col gap-1 text-sm">
              {t.booking[k]}
              <select name={k} defaultValue={k === "rating" ? "5" : ""} required={k === "rating"} className="input">
                {k !== "rating" && <option value="">—</option>}
                {[5, 4, 3, 2, 1].map((v) => (
                  <option key={v} value={v}>
                    {"★".repeat(v)}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <label className="flex flex-col gap-1 text-sm sm:col-span-3">
            {t.booking.comment}
            <textarea name="comment" maxLength={1000} rows={2} className="input" />
          </label>
        </ActionForm>
      )}
      {b.review && (
        <div className="card text-sm" data-testid="review">
          {t.booking.yourReview}: {"★".repeat(b.review.rating)} {b.review.comment}
        </div>
      )}

      <div className="card text-sm">
        <h2 className="font-bold">{t.booking.history}</h2>
        <ol data-testid="history">
          {b.history.map((h) => (
            <li key={h.id}>
              {fmtDateTime(h.createdAt, locale)} — {t.status[h.to]}
              {h.reason && <span className="muted"> ({h.reason === "acceptance_timeout" ? t.booking.system : h.reason})</span>}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
