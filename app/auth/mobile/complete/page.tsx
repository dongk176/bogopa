import { redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { createMobileAuthTransfer } from "@/lib/server/mobile-auth-transfer";

type MobileAuthCompletePageProps = {
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

function normalizeProvider(providerValue: string | string[] | undefined) {
  const raw = Array.isArray(providerValue) ? providerValue[0] : providerValue;
  if (raw === "google") return "google";
  if (raw === "apple") return "apple";
  return "kakao";
}

export default async function MobileAuthCompletePage({ searchParams }: MobileAuthCompletePageProps) {
  const session = await getServerSession(authOptions);
  const sessionUser = session?.user as { id?: string } | undefined;
  const resolvedSearchParams = searchParams instanceof Promise ? await searchParams : searchParams;
  const provider = normalizeProvider(resolvedSearchParams?.provider);
  const nextPath = normalizeNextPath(resolvedSearchParams?.next);

  if (!sessionUser?.id) {
    redirect(`/auth/mobile/start?provider=${provider}&next=${encodeURIComponent(nextPath)}`);
  }

  const transfer = await createMobileAuthTransfer({
    userId: sessionUser.id,
    nextPath,
  });

  const deepLink = `co.kr.bogopa.app://auth/complete?token=${encodeURIComponent(transfer.token)}&next=${encodeURIComponent(
    transfer.nextPath,
  )}`;

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#faf9f5] px-6 text-center text-[#2f342e]">
      <script
        dangerouslySetInnerHTML={{
          __html: `window.location.replace(${JSON.stringify(deepLink)});`,
        }}
      />
      <div className="max-w-md space-y-3">
        <h1 className="font-headline text-2xl font-bold">앱으로 돌아가는 중</h1>
        <p className="text-sm text-[#655d5a]">자동으로 돌아가지 않으면 아래 버튼을 눌러주세요.</p>
        <a
          href={deepLink}
          className="inline-flex items-center justify-center rounded-full bg-[#4a626d] px-5 py-3 text-sm font-semibold text-[#f0f9ff]"
        >
          Bogopa 앱으로 돌아가기
        </a>
      </div>
    </main>
  );
}
