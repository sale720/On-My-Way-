import Link from "next/link";
import { getCurrentUser, getDictionary } from "@/server/web";

export default async function Home() {
  const [dict, user] = await Promise.all([getDictionary(), getCurrentUser()]);
  return (
    <section className="flex flex-col gap-6 py-10">
      <h1 className="text-4xl font-bold">
        {dict.appName} — {dict.tagline}
      </h1>
      <p className="text-lg muted">{dict.home.intro}</p>
      <p className="card text-sm">{dict.home.phaseNote}</p>
      {!user && (
        <Link href="/login" className="btn self-start">
          {dict.home.cta}
        </Link>
      )}
    </section>
  );
}
