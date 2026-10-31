import { notFound, redirect } from "next/navigation";
import { isAppError } from "@/server/errors";
import { getSandboxCheckout } from "@/server/payments/checkout";
import { SANDBOX_CARDS } from "@/server/payments/sandbox";
import { getCurrentUser, getDict2, getLocale } from "@/server/web";
import { ActionForm } from "../../../_components/ActionForm";
import { formatSar } from "../../../_components/format";
import { sandboxPayAction } from "../../../actions2";

/** Sandbox hosted checkout. Looks like a gateway page; moves no money and stores no card data. */
export default async function SandboxCheckoutPage({ params }: { params: Promise<{ ref: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const [{ ref }, t, locale] = await Promise.all([params, getDict2(), getLocale()]);
  let p: Awaited<ReturnType<typeof getSandboxCheckout>>;
  try {
    p = await getSandboxCheckout(user, ref);
  } catch (e) {
    if (isAppError(e) && e.code === "NOT_FOUND") notFound();
    throw e;
  }
  const isCard = p.method === "MADA" || p.method === "CARD";
  const open = p.status === "PENDING" && p.booking.status === "PENDING_PAYMENT";
  const hidden = (
    <>
      <input type="hidden" name="providerRef" value={ref} />
      <input type="hidden" name="bookingId" value={p.bookingId} />
    </>
  );
  return (
    <section className="mx-auto flex max-w-md flex-col gap-4" data-testid="sandbox-checkout">
      <p className="card text-sm font-medium" role="note" style={{ borderColor: "var(--accent)" }}>
        {t.sandbox.banner}
      </p>
      <h1 className="text-2xl font-bold">{t.sandbox.title}</h1>
      <div className="card text-sm">
        <div>
          {t.book.paymentMethod}: <strong>{t.pay[p.method]}</strong>
        </div>
        <div>
          {p.booking.salon.name} · <span dir="ltr">{p.booking.number}</span>
        </div>
        <div className="text-lg font-bold" data-testid="sandbox-amount">
          {formatSar(p.amountHalalas, locale)}
        </div>
      </div>
      {!open ? (
        <p className="card">{t.sandbox.closed}</p>
      ) : isCard ? (
        <>
          <ActionForm action={sandboxPayAction} submitLabel={t.sandbox.pay} className="card flex flex-col gap-2" testId="sandbox-card-form">
            {hidden}
            <input type="hidden" name="outcome" value="approve" />
            <label className="flex flex-col gap-1 text-sm">
              {t.sandbox.cardNumber}
              <input name="cardNumber" inputMode="numeric" autoComplete="off" required dir="ltr" className="input tracking-widest" placeholder="4111 1111 1111 1111" />
            </label>
            <p className="muted text-xs">{t.sandbox.noCardStored}</p>
          </ActionForm>
          <div className="card text-xs" data-testid="sandbox-test-cards">
            <div className="font-bold">{t.sandbox.testCards}</div>
            <div dir="ltr">{SANDBOX_CARDS.approve.replace(/(\d{4})(?=\d)/g, "$1 ")} → {t.sandbox.approved}</div>
            <div dir="ltr">{SANDBOX_CARDS.decline.replace(/(\d{4})(?=\d)/g, "$1 ")} → {t.sandbox.declined}</div>
          </div>
        </>
      ) : (
        <div className="flex gap-2">
          <ActionForm action={sandboxPayAction} submitLabel={t.sandbox.approve} testId="sandbox-approve">
            {hidden}
            <input type="hidden" name="outcome" value="approve" />
          </ActionForm>
          <ActionForm action={sandboxPayAction} submitLabel={t.sandbox.decline} testId="sandbox-decline">
            {hidden}
            <input type="hidden" name="outcome" value="decline" />
          </ActionForm>
        </div>
      )}
    </section>
  );
}
