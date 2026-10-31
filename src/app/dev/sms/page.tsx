import { notFound } from "next/navigation";
import { normalizeSaudiMobile } from "@/server/auth/phone";
import { listSandboxSms } from "@/server/sms/provider";
import { getLocale } from "@/server/web";
import { fmtDateTime } from "../../_components/format";

/** Sandbox SMS inbox: shows messages the sandbox provider "sent". Not available in production. */
export default async function SandboxSmsPage({ searchParams }: { searchParams: Promise<{ phone?: string }> }) {
  const [{ phone }, locale] = await Promise.all([searchParams, getLocale()]);
  let normalized: string | undefined;
  try {
    normalized = phone ? normalizeSaudiMobile(phone) : undefined;
  } catch {
    normalized = undefined;
  }
  const messages = await listSandboxSms(normalized);
  if (messages === null) notFound();
  const ar = locale === "ar";
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">{ar ? "صندوق الرسائل التجريبي" : "Sandbox SMS inbox"}</h1>
      <p className="card text-sm" role="note">
        {ar
          ? "وضع تجريبي: هذه الرسائل لم تُرسل إلى أي جوال. تُعرض هنا فقط لتجربة تسجيل الدخول. هذه الصفحة غير متاحة في الإنتاج."
          : "Sandbox mode: these messages were not sent to any phone. They are shown only for testing sign-in. This page is unavailable in production."}
      </p>
      <form className="flex gap-2">
        <input name="phone" defaultValue={phone} dir="ltr" placeholder="05XXXXXXXX" className="input" />
        <button className="btn-ghost">{ar ? "تصفية" : "Filter"}</button>
      </form>
      <ul className="flex flex-col gap-2" data-testid="sandbox-sms">
        {messages.map((m) => (
          <li key={m.id} className="card text-sm">
            <div className="muted" dir="ltr">
              {m.to} · {fmtDateTime(m.createdAt, locale)}
            </div>
            <div>{m.body}</div>
          </li>
        ))}
      </ul>
    </section>
  );
}
