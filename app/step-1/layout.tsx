import { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getUserProfile } from "@/lib/server/user-profile";

export default async function StepOneLayout({ children }: { children: ReactNode }) {
  const session = await getServerSession(authOptions);
  const sessionUser = session?.user as { id?: string } | undefined;

  if (!sessionUser?.id) {
    redirect("/");
  }

  try {
    const profile = await getUserProfile(sessionUser.id);
    if (!profile.profileCompleted) {
      redirect("/signup?returnTo=%2Fstep-1");
    }
  } catch {
    redirect("/signup?returnTo=%2Fstep-1");
  }

  return <>{children}</>;
}
