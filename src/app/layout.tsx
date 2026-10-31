import type { Metadata } from "next";
import Link from "next/link";
import { IBM_Plex_Sans_Arabic } from "next/font/google";
import { dirOf } from "@/i18n/dictionaries";
import { hasPlatformPermission } from "@/server/rbac/authorize";
import { getCurrentUser, getDictionary, getLocale } from "@/server/web";
import { logoutAction, setLocaleAction } from "./actions";
import "./globals.css";

const plexArabic = IBM_Plex_Sans_Arabic({
  variable: "--font-arabic",
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  title: "On My Way | في الطريق",
  description: "احجزي خدمات الصالون في منزلك بسهولة",
};

// Every page depends on the session cookie and live database state.
export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const [locale, dict, user] = await Promise.all([getLocale(), getDictionary(), getCurrentUser()]);
  const isStaff = user && hasPlatformPermission(user, "platform.users.read");

  return (
    <html lang={locale} dir={dirOf(locale)}>
      <body className={`${plexArabic.variable} antialiased`}>
        <header className="border-b" style={{ borderColor: "var(--border)" }}>
          <nav className="mx-auto flex max-w-4xl flex-wrap items-center gap-3 px-4 py-3 text-sm">
            <Link href="/" className="font-bold">
              {dict.appName}
            </Link>
            <span className="flex-1" />
            {user ? (
              <>
                <Link href="/account" data-testid="nav-account">
                  {dict.nav.account}
                </Link>
                {isStaff && <Link href="/admin">{dict.nav.admin}</Link>}
                <form action={logoutAction}>
                  <button type="submit" className="btn-ghost" data-testid="logout">
                    {dict.nav.logout}
                  </button>
                </form>
              </>
            ) : (
              <Link href="/login">{dict.nav.login}</Link>
            )}
            <form action={setLocaleAction}>
              <input type="hidden" name="locale" value={locale === "ar" ? "en" : "ar"} />
              <button type="submit" className="btn-ghost" data-testid="switch-locale">
                {dict.nav.language}
              </button>
            </form>
          </nav>
        </header>
        <main className="mx-auto max-w-4xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
