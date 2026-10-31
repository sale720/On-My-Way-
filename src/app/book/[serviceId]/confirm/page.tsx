import { redirect } from "next/navigation";
import { quoteBooking } from "@/server/bookings/service";
import { getCurrentUser, getDict2, getLocale } from "@/server/web";
import { ActionForm } from "../../../_components/ActionForm";
import { fmtDateTime, formatSar } from "../../../_components/format";
import { createBookingAction } from "../../../actions2";

export default async function ConfirmPage({
  params,
  searchParams,
}: {
  params: Promise<{ serviceId: string }>;
  searchParams: Promise<{ addressId?: string; start?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const [{ serviceId }, sp, t, locale] = await Promise.all([params, searchParams, getDict2(), getLocale()]);
  if (!sp.addressId || !sp.start || Number.isNaN(Date.parse(sp.start))) redirect("/book");
  const q = await quoteBooking(user, { salonServiceId: serviceId, addressId: sp.addressId });
  const n = (x: { nameAr: string; nameEn: string }) => (locale === "ar" ? x.nameAr : x.nameEn);
  const firstAvailable = q.paymentMethods.find((m) => m.state === "AVAILABLE")?.method;

  return (
    <section className="flex max-w-xl flex-col gap-4">
      <h1 className="text-2xl font-bold">{t.book.confirmTitle}</h1>
      <div className="card flex flex-col gap-1 text-sm" data-testid="summary">
        <div className="text-base font-bold">{n(q.service)}</div>
        <div>{q.salon.name}</div>
        <div>
          {t.booking.when}: {fmtDateTime(new Date(sp.start), locale)}
        </div>
        <div>
          {t.booking.address}: {n(q.address.district.city)} — {n(q.address.district)}، {q.address.street}
        </div>
        <hr className="my-2" style={{ borderColor: "var(--border)" }} />
        <div>
          {t.book.subtotal}: {formatSar(q.quote.subtotalHalalas, locale)}
        </div>
        <div>
          {t.book.travelFee}: {formatSar(q.quote.travelFeeHalalas, locale)}
        </div>
        <div>
          {t.book.vat} ({q.quote.vatBps / 100}%): {formatSar(q.quote.vatHalalas, locale)}
        </div>
        <div className="text-base font-bold" data-testid="total">
          {t.book.total}: {formatSar(q.quote.totalHalalas, locale)}
        </div>
      </div>

      <ActionForm action={createBookingAction} submitLabel={t.book.confirm} className="flex flex-col gap-3" testId="confirm-form">
        <input type="hidden" name="salonServiceId" value={serviceId} />
        <input type="hidden" name="addressId" value={sp.addressId} />
        <input type="hidden" name="startsAt" value={sp.start} />
        <fieldset className="card flex flex-col gap-2" data-testid="payment-methods">
          <legend className="font-bold">{t.book.paymentMethod}</legend>
          {q.paymentMethods.map((m) => (
            <label key={m.method} className={`flex items-center gap-2 ${m.state === "AVAILABLE" ? "" : "muted"}`} data-method={m.method} data-state={m.state}>
              <input type="radio" name="paymentMethod" value={m.method} disabled={m.state !== "AVAILABLE"} defaultChecked={m.method === firstAvailable} required />
              <span>{t.pay[m.method]}</span>
              {m.state !== "AVAILABLE" && <span className="text-xs">({t.payState[m.state]})</span>}
            </label>
          ))}
        </fieldset>
        <label className="flex flex-col gap-1 text-sm">
          {t.book.notes}
          <textarea name="notes" maxLength={500} rows={2} className="input" />
        </label>
        <p className="muted text-xs">{t.book.afterSubmit}</p>
      </ActionForm>
    </section>
  );
}
