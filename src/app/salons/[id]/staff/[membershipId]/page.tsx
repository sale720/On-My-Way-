import { notFound } from "next/navigation";
import { db } from "@/server/db";
import { getSchedule } from "@/server/availability/service";
import { listSalonCoverage } from "@/server/geo/service";
import { listSalonServices } from "@/server/catalog/service";
import { AppError } from "@/server/errors";
import { minutesToHHMM } from "@/server/time";
import { getDict2, getLocale } from "@/server/web";
import { ActionForm } from "../../../../_components/ActionForm";
import { dayOffAction, scheduleAction, staffCoverageAction, staffSkillsAction } from "../../../../actions2";
import { loadSalon } from "../../guard";
import { SalonTabs } from "../../SalonTabs";

export default async function StaffMemberPage({ params }: { params: Promise<{ id: string; membershipId: string }> }) {
  const { id, membershipId } = await params;
  const { user, salon } = await loadSalon(id);
  let schedule: Awaited<ReturnType<typeof getSchedule>>;
  try {
    schedule = await getSchedule(user, id, membershipId); // self, or salon.staff.manage
  } catch (e) {
    if (e instanceof AppError && (e.code === "NOT_FOUND" || e.code === "FORBIDDEN")) notFound();
    throw e;
  }
  const [t, locale, member, services, areas] = await Promise.all([
    getDict2(),
    getLocale(),
    db.salonMembership.findUniqueOrThrow({ where: { id: membershipId }, include: { user: true, skills: true, coverage: true } }),
    listSalonServices(user, id),
    listSalonCoverage(user, id),
  ]);
  const n = (x: { nameAr: string; nameEn: string }) => (locale === "ar" ? x.nameAr : x.nameEn);
  const ruleFor = (d: number) => schedule.rules.find((r) => r.weekday === d);
  const hidden = (
    <>
      <input type="hidden" name="salonId" value={id} />
      <input type="hidden" name="membershipId" value={membershipId} />
    </>
  );

  return (
    <section className="flex flex-col gap-5">
      <h1 className="text-2xl font-bold">
        {salon.name} — {member.user.name ?? member.user.phone}
      </h1>
      <SalonTabs salonId={id} current="staff" />

      <ActionForm action={staffSkillsAction} submitLabel={t.common.save} className="card flex flex-col gap-2" testId="skills-form">
        <h2 className="font-bold">{t.salon.skills}</h2>
        {hidden}
        {services.filter((s) => s.active).map((s) => (
          <label key={s.id} className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="serviceIds" value={s.id} defaultChecked={member.skills.some((k) => k.salonServiceId === s.id)} />
            {n(s)}
          </label>
        ))}
      </ActionForm>

      <ActionForm action={staffCoverageAction} submitLabel={t.common.save} className="card flex flex-col gap-2" testId="staff-coverage-form">
        <h2 className="font-bold">{t.salon.myCoverage}</h2>
        {hidden}
        {areas.filter((a) => a.active).map((a) => (
          <label key={a.districtId} className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="districtIds" value={a.districtId} defaultChecked={member.coverage.some((c) => c.districtId === a.districtId)} />
            {n(a.district.city)} — {n(a.district)}
          </label>
        ))}
      </ActionForm>

      <ActionForm action={scheduleAction} submitLabel={t.common.save} className="card flex flex-col gap-2" testId="schedule-form">
        <h2 className="font-bold">{t.salon.schedule}</h2>
        <p className="muted text-xs">{t.salon.scheduleHint}</p>
        {hidden}
        {t.weekdays.map((day, d) => (
          <div key={d} className="flex flex-wrap items-center gap-2 text-sm">
            <span className="w-24">{day}</span>
            <input name={`from${d}`} type="time" defaultValue={ruleFor(d) ? minutesToHHMM(ruleFor(d)!.startMinute) : ""} className="input" aria-label={`${day} ${t.salon.from}`} dir="ltr" />
            <span>—</span>
            <input name={`to${d}`} type="time" defaultValue={ruleFor(d) ? minutesToHHMM(ruleFor(d)!.endMinute) : ""} className="input" aria-label={`${day} ${t.salon.to}`} dir="ltr" />
          </div>
        ))}
      </ActionForm>

      <div className="card flex flex-col gap-2">
        <h2 className="font-bold">{t.salon.dayOff}</h2>
        <ul className="text-sm">
          {schedule.exceptions.map((e) => (
            <li key={e.id} className="flex items-center gap-2">
              <span dir="ltr">{e.date.toISOString().slice(0, 10)}</span> {e.reason}
              <ActionForm action={dayOffAction} submitLabel={t.common.delete} className="inline-flex">
                {hidden}
                <input type="hidden" name="exceptionId" value={e.id} />
              </ActionForm>
            </li>
          ))}
        </ul>
        <ActionForm action={dayOffAction} submitLabel={t.salon.addDayOff}>
          {hidden}
          <input name="date" type="date" required className="input" dir="ltr" />
          <input name="reason" maxLength={200} placeholder={t.common.reason} className="input" />
        </ActionForm>
      </div>
    </section>
  );
}
