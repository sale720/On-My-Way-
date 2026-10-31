import Link from "next/link";
import { db } from "@/server/db";
import { salonRoleHas } from "@/server/rbac/permissions";
import { getDictionary, getDict2 } from "@/server/web";
import { loadSalon } from "../guard";
import { SalonTabs } from "../SalonTabs";

export default async function StaffPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, salon, role } = await loadSalon(id);
  const [t, dict] = await Promise.all([getDict2(), getDictionary()]);
  const seesAll = role === null || salonRoleHas(role, "salon.staff.manage");
  // Staff see only their own row; managers/owners (and platform readers) see the whole team.
  const members = await db.salonMembership.findMany({
    where: { salonId: id, status: "ACTIVE", ...(seesAll ? {} : { userId: user.id }) },
    include: {
      user: { select: { name: true, phone: true } },
      _count: { select: { skills: true, coverage: true, availability: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  return (
    <section className="flex flex-col gap-5">
      <h1 className="text-2xl font-bold">{salon.name}</h1>
      <SalonTabs salonId={id} current="staff" />
      <ul className="flex flex-col gap-2" data-testid="staff">
        {members.map((m) => (
          <li key={m.id} className="card flex flex-wrap items-center gap-3 text-sm">
            <span className="font-medium">{m.user.name ?? m.user.phone}</span>
            <span className="muted">{dict.enums[m.role]}</span>
            <span>
              {t.salon.skills}: {m._count.skills} · {t.salon.myCoverage}: {m._count.coverage} · {t.salon.schedule}: {m._count.availability}
            </span>
            <Link href={`/salons/${id}/staff/${m.id}`} className="btn-ghost">
              {t.salon.manage}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
