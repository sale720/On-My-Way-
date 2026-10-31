import { notFound, redirect } from "next/navigation";
import { AppError } from "@/server/errors";
import { getSalon } from "@/server/salons/service";
import { getCurrentUser } from "@/server/web";

/** Loads the salon for the current user or renders 404 (no existence leak). */
export async function loadSalon(id: string) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  try {
    const { salon, role } = await getSalon(user, id);
    return { user, salon, role };
  } catch (e) {
    if (e instanceof AppError && (e.code === "NOT_FOUND" || e.code === "FORBIDDEN")) notFound();
    throw e;
  }
}
