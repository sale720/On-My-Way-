import { listSalonPaymentMethods } from "@/server/payments/service";
import { salonRoleHas } from "@/server/rbac/permissions";
import { getDict2 } from "@/server/web";
import { ActionForm } from "../../../_components/ActionForm";
import { salonPaymentMethodAction, salonPolicyAction } from "../../../actions2";
import { loadSalon } from "../guard";
import { SalonTabs } from "../SalonTabs";

export default async function SalonSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, salon, role } = await loadSalon(id);
  const [t, methods] = await Promise.all([getDict2(), listSalonPaymentMethods(user, id)]);
  const canPolicy = role ? salonRoleHas(role, "salon.settings.manage") : false;
  const canPay = role ? salonRoleHas(role, "salon.payments.manage") : false;
  const fields = [
    ["travelBufferMinutes", t.salon.travelBuffer, salon.travelBufferMinutes],
    ["minNoticeMinutes", t.salon.minNotice, salon.minNoticeMinutes],
    ["maxAdvanceDays", t.salon.maxAdvance, salon.maxAdvanceDays],
    ["cancellationWindowHours", t.salon.cancelWindow, salon.cancellationWindowHours],
    ["acceptanceTimeoutMinutes", t.salon.acceptTimeout, salon.acceptanceTimeoutMinutes],
  ] as const;

  return (
    <section className="flex flex-col gap-5">
      <h1 className="text-2xl font-bold">{salon.name}</h1>
      <SalonTabs salonId={id} current="settings" />

      <ActionForm action={salonPolicyAction} submitLabel={t.common.save} className="card grid gap-2 sm:grid-cols-2" testId="policy-form">
        <h2 className="font-bold sm:col-span-2">{t.salon.policy}</h2>
        <input type="hidden" name="salonId" value={id} />
        {fields.map(([name, label, value]) => (
          <label key={name} className="flex flex-col gap-1 text-sm">
            {label}
            <input name={name} type="number" min={0} defaultValue={value} disabled={!canPolicy} required className="input" />
          </label>
        ))}
      </ActionForm>

      <div className="card flex flex-col gap-2">
        <h2 className="font-bold">{t.salon.paymentMethods}</h2>
        <table className="grid-table" data-testid="salon-payment-methods">
          <tbody>
            {methods.map((m) => (
              <tr key={m.method} data-method={m.method} data-state={m.state}>
                <td className="font-medium">{t.pay[m.method]}</td>
                <td>{t.payState[m.state]}</td>
                <td className="muted">{m.requires ? t.payRequires[m.requires] : ""}</td>
                <td>
                  {canPay && m.integrated && m.platformEnabled && (
                    <ActionForm action={salonPaymentMethodAction} submitLabel={m.salonEnabled ? t.common.disable : t.common.enable}>
                      <input type="hidden" name="salonId" value={id} />
                      <input type="hidden" name="method" value={m.method} />
                      <input type="hidden" name="enabled" value={m.salonEnabled ? "false" : "true"} />
                    </ActionForm>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
