import { notFound, redirect } from "next/navigation";
import { listPlatformPaymentMethods } from "@/server/payments/service";
import { hasPlatformPermission } from "@/server/rbac/authorize";
import { getSettings } from "@/server/settings/service";
import { getCurrentUser, getDictionary, getDict2 } from "@/server/web";
import { ActionForm } from "../../_components/ActionForm";
import { platformPaymentMethodAction, platformSettingAction } from "../../actions2";
import { AdminNav } from "../AdminNav";

export default async function AdminSettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!hasPlatformPermission(user, "platform.settings.manage")) notFound();
  const [t, dict, settings, methods] = await Promise.all([getDict2(), getDictionary(), getSettings(), listPlatformPaymentMethods(user)]);

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">{dict.admin.title}</h1>
      <AdminNav actor={user} current="settings" />

      <div className="card flex flex-col gap-3">
        <h2 className="text-lg font-bold">{t.admin.settings}</h2>
        <p className="muted text-xs">{t.admin.settingsNote}</p>
        {(
          [
            ["commissionBps", t.admin.commission, settings.commissionBps],
            ["vatBps", t.admin.vat, settings.vatBps],
          ] as const
        ).map(([key, label, bps]) => (
          <ActionForm key={key} action={platformSettingAction} submitLabel={t.common.save} testId={`setting-${key}`}>
            <input type="hidden" name="key" value={key} />
            <label className="flex flex-col gap-1 text-sm">
              {label}
              <input name="percent" type="number" min={0} max={100} step="0.01" defaultValue={bps / 100} required className="input w-28" />
            </label>
            <input name="reason" required minLength={3} placeholder={dict.admin.reason} className="input flex-1" />
          </ActionForm>
        ))}
      </div>

      <div className="card flex flex-col gap-3">
        <h2 className="text-lg font-bold">{t.admin.paymentMethods}</h2>
        <p className="muted text-xs">{t.admin.paymentNote}</p>
        <div className="overflow-x-auto">
          <table className="grid-table" data-testid="platform-payment-methods">
            <thead>
              <tr>
                <th />
                <th />
                <th>{t.admin.requires}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {methods.map((m) => (
                <tr key={m.method} data-method={m.method} data-state={m.state}>
                  <td className="font-medium">{t.pay[m.method]}</td>
                  <td>{t.payState[m.state]}</td>
                  <td className="muted">{m.requires ? t.payRequires[m.requires] : "—"}</td>
                  <td>
                    {m.integrated && (
                      <ActionForm action={platformPaymentMethodAction} submitLabel={m.platformEnabled ? t.common.disable : t.common.enable}>
                        <input type="hidden" name="method" value={m.method} />
                        <input type="hidden" name="enabled" value={m.platformEnabled ? "false" : "true"} />
                        <input name="reason" required minLength={3} placeholder={dict.admin.reason} className="input" />
                      </ActionForm>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
