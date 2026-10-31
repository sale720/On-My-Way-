import Link from "next/link";
import { getDict2 } from "@/server/web";

const TABS = ["overview", "services", "coverage", "staff", "bookings", "settings"] as const;

export async function SalonTabs({ salonId, current }: { salonId: string; current: (typeof TABS)[number] }) {
  const t = await getDict2();
  return (
    <nav className="flex flex-wrap gap-2 text-sm" data-testid="salon-tabs">
      {TABS.map((k) => (
        <Link
          key={k}
          href={k === "overview" ? `/salons/${salonId}` : `/salons/${salonId}/${k}`}
          className={k === current ? "btn" : "btn-ghost"}
          aria-current={k === current ? "page" : undefined}
        >
          {t.salon.tabs[k]}
        </Link>
      ))}
    </nav>
  );
}
