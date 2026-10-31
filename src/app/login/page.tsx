import { redirect } from "next/navigation";
import Link from "next/link";
import { env } from "@/server/env";
import { sandboxInboxEnabled } from "@/server/sms/provider";
import { getCurrentUser, getDictionary } from "@/server/web";
import { ActionForm } from "../_components/ActionForm";
import { requestOtpAction, verifyOtpAction } from "../actions";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ step?: string; phone?: string }> }) {
  if (await getCurrentUser()) redirect("/account");
  const [dict, sp] = await Promise.all([getDictionary(), searchParams]);
  const codeStep = sp.step === "code" && sp.phone;

  return (
    <section className="mx-auto flex max-w-sm flex-col gap-4">
      <h1 className="text-2xl font-bold">{dict.login.title}</h1>
      {env().APP_ENV !== "production" &&
        (sandboxInboxEnabled() ? (
          <p className="card text-xs" data-testid="sandbox-note">
            {dict.login.sandboxNote}{" "}
            <Link href={`/dev/sms${sp.phone ? `?phone=${encodeURIComponent(sp.phone)}` : ""}`} target="_blank" className="underline">
              {dict.login.sandboxInbox}
            </Link>
          </p>
        ) : (
          <p className="card text-xs muted">{dict.login.devNote}</p>
        ))}

      {!codeStep ? (
        <ActionForm action={requestOtpAction} submitLabel={dict.login.sendCode} className="flex flex-col gap-2" testId="phone-form">
          <label htmlFor="phone">{dict.login.phone}</label>
          <input
            id="phone"
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            required
            dir="ltr"
            placeholder={dict.login.phoneHint}
            className="input"
          />
        </ActionForm>
      ) : (
        <>
          <p className="text-sm muted">
            {dict.login.codeHint} <span dir="ltr">{sp.phone}</span>
          </p>
          <ActionForm action={verifyOtpAction} submitLabel={dict.login.verify} className="flex flex-col gap-2" testId="code-form">
            <input type="hidden" name="phone" value={sp.phone} />
            <label htmlFor="code">{dict.login.code}</label>
            <input
              id="code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              dir="ltr"
              className="input tracking-widest"
            />
          </ActionForm>
          <Link href="/login" className="text-sm underline">
            {dict.login.changePhone}
          </Link>
        </>
      )}
    </section>
  );
}
