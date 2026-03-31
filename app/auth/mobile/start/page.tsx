import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import MobileAuthStartClient from "./MobileAuthStartClient";

type MobileAuthStartPageProps = {
  searchParams?:
    | Record<string, string | string[] | undefined>
    | Promise<Record<string, string | string[] | undefined>>;
};

function getSingleParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function buildCanonicalAuthStartUrl(input: {
  nextAuthUrl: string;
  provider: string | undefined;
  nextPath: string | undefined;
}) {
  const canonical = new URL("/auth/mobile/start", input.nextAuthUrl);
  if (input.provider) canonical.searchParams.set("provider", input.provider);
  if (input.nextPath) canonical.searchParams.set("next", input.nextPath);
  return canonical.toString();
}

export default async function MobileAuthStartPage({ searchParams }: MobileAuthStartPageProps) {
  const resolvedSearchParams = searchParams instanceof Promise ? await searchParams : searchParams;
  const provider = getSingleParam(resolvedSearchParams?.provider);
  const nextPath = getSingleParam(resolvedSearchParams?.next);

  const configuredNextAuthUrl = process.env.NEXTAUTH_URL?.trim();
  if (configuredNextAuthUrl) {
    const requestHeaders = await headers();
    const requestHost = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
    const requestProto =
      requestHeaders.get("x-forwarded-proto") ??
      (requestHost?.startsWith("localhost") || requestHost?.startsWith("127.0.0.1") ? "http" : "https");

    if (requestHost) {
      const requestOrigin = `${requestProto}://${requestHost}`;
      const configuredOrigin = new URL(configuredNextAuthUrl).origin;

      // Keep OAuth host consistent with NEXTAUTH_URL so state cookies are validated correctly.
      if (requestOrigin !== configuredOrigin) {
        redirect(
          buildCanonicalAuthStartUrl({
            nextAuthUrl: configuredOrigin,
            provider,
            nextPath,
          }),
        );
      }
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#faf9f5] px-6 text-center text-[#2f342e]">
      <Suspense
        fallback={
          <div className="max-w-md space-y-3">
            <h1 className="font-headline text-2xl font-bold">로그인 연결 중</h1>
            <p className="text-sm text-[#655d5a]">잠시만 기다려 주세요. 인증 화면으로 이동합니다.</p>
          </div>
        }
      >
        <MobileAuthStartClient />
      </Suspense>
    </main>
  );
}
