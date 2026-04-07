import Link from "next/link";

type AuthBlockedPageProps = {
  searchParams?:
    | Record<string, string | string[] | undefined>
    | Promise<Record<string, string | string[] | undefined>>;
};

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeBlockedUntil(value: string | string[] | undefined) {
  const raw = (firstValue(value) || "").trim();
  if (!raw) return "";
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString();
}

function formatBlockedUntilKst(iso: string) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default async function AuthBlockedPage({ searchParams }: AuthBlockedPageProps) {
  const resolvedSearchParams = searchParams instanceof Promise ? await searchParams : searchParams;
  const blockedUntil = normalizeBlockedUntil(resolvedSearchParams?.until);
  const provider = (firstValue(resolvedSearchParams?.provider) || "").trim();

  const query = new URLSearchParams({ blocked: "1" });
  if (blockedUntil) query.set("until", blockedUntil);
  if (provider) query.set("provider", provider);

  const webLoginPath = `/login?${query.toString()}`;
  const deepLink = `co.kr.bogopa.app://auth/complete?${query.toString()}`;
  const blockedUntilLabel = formatBlockedUntilKst(blockedUntil);
  const message = blockedUntilLabel
    ? `탈퇴한 계정은 30일 동안 다시 로그인할 수 없습니다. (${blockedUntilLabel} 이후 가능)`
    : "탈퇴한 계정은 30일 동안 다시 로그인할 수 없습니다.";

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#faf9f5] px-6 text-center text-[#2f342e]">
      <script
        dangerouslySetInnerHTML={{
          __html: `
            (function () {
              var deepLink = ${JSON.stringify(deepLink)};
              var tried = 0;
              var tryOpen = function () {
                if (tried >= 3) return;
                tried += 1;
                window.location.href = deepLink;
              };
              tryOpen();
              window.setTimeout(tryOpen, 450);
              window.setTimeout(tryOpen, 1200);
            })();
          `,
        }}
      />
      <div className="max-w-md space-y-3">
        <h1 className="font-headline text-2xl font-bold">로그인이 제한된 계정입니다</h1>
        <p className="text-sm text-[#655d5a]">{message}</p>
        <a
          href={deepLink}
          className="inline-flex items-center justify-center rounded-full bg-[#4a626d] px-5 py-3 text-sm font-semibold text-[#f0f9ff]"
        >
          앱으로 돌아가기
        </a>
        <div>
          <Link href={webLoginPath} className="text-sm font-semibold text-[#4a626d] underline underline-offset-4">
            웹 로그인 화면으로 이동
          </Link>
        </div>
      </div>
    </main>
  );
}
