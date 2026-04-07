import { redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { isUserAdmin } from "@/lib/server/user-profile";
import AdminDashboardClient from "./AdminDashboardClient";

export default async function AdminPage() {
  const session = await getServerSession(authOptions);
  const sessionUser = session?.user as { id?: string } | undefined;
  if (!sessionUser?.id) {
    redirect("/");
  }

  const admin = await isUserAdmin(sessionUser.id);
  if (!admin) {
    redirect("/");
  }

  return <AdminDashboardClient />;
}
