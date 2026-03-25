import { redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getUserProfile } from "@/lib/server/user-profile";

type AuthEntryPageProps = {
  searchParams?:
    | Record<string, string | string[] | undefined>
    | Promise<Record<string, string | string[] | undefined>>;
};

function normalizeNextPath(nextValue: string | string[] | undefined) {
  const raw = Array.isArray(nextValue) ? nextValue[0] : nextValue;
  if (!raw || !raw.startsWith("/")) return "/step-1";
  if (raw.startsWith("/api/")) return "/step-1";
  if (raw.startsWith("/auth/")) return "/step-1";
  if (raw.startsWith("/signup")) return "/step-1";
  return raw;
}

export default async function AuthEntryPage({ searchParams }: AuthEntryPageProps) {
  const session = await getServerSession(authOptions);
  const sessionUser = session?.user as { id?: string; profileCompleted?: boolean } | undefined;
  const resolvedSearchParams = searchParams instanceof Promise ? await searchParams : searchParams;
  const nextPath = normalizeNextPath(resolvedSearchParams?.next);

  if (!sessionUser?.id) {
    redirect("/");
  }

  if (sessionUser.profileCompleted === true) {
    redirect(nextPath);
  }

  try {
    const profile = await getUserProfile(sessionUser.id);
    if (profile.profileCompleted) {
      redirect(nextPath);
    }
    redirect("/signup?returnTo=%2Fstep-1");
  } catch {
    redirect("/signup?returnTo=%2Fstep-1");
  }
}
