import Link from "next/link";
import UserProfileMenu from "@/app/_components/UserProfileMenu";
import LegalMobileHeader from "@/app/_components/LegalMobileHeader";
import LegalExitScrollMarker from "@/app/_components/LegalExitScrollMarker";

export default function DataDeletionPage() {
  const appDeleteSteps = [
    "보고파 앱 실행 후 로그인",
    "메시지 > 대화 목록에서 삭제할 대화를 선택하고 삭제",
    "내 기억 > 삭제할 기억을 선택하고 삭제",
    "계정은 유지한 채 선택한 데이터만 삭제됩니다.",
  ];

  const requestSteps = [
    "앱에서 직접 삭제가 어려운 데이터는 이메일로 요청",
    "요청 시 계정 식별 정보(로그인 이메일/ID)와 삭제할 항목을 함께 기재",
    "확인 절차 후 처리 결과를 회신",
  ];

  const deletableData = [
    "대화 기록(선택한 대화방 단위 삭제)",
    "내 기억(페르소나) 데이터(선택 항목 삭제)",
  ];

  const retainedData = [
    "법령상 보관이 필요한 결제/거래 관련 기록: 최대 5년",
    "소비자 불만 또는 분쟁처리 기록: 최대 3년",
    "표시·광고 관련 기록: 최대 6개월",
    "통신사실확인자료(접속기록): 최대 3개월",
  ];

  return (
    <div className="flex min-h-screen flex-col bg-[#faf9f5] text-[#2f342e]">
      <LegalExitScrollMarker />
      <LegalMobileHeader title="데이터 삭제 안내" backHref="/" />

      <header className="fixed top-0 z-50 hidden w-full border-b border-[#afb3ac]/25 bg-[#faf9f5]/80 pt-[env(safe-area-inset-top)] backdrop-blur-xl md:block">
        <div className="mx-auto flex h-16 w-full max-w-3xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2">
            <img src="/logo/bogopa%20logo.png" alt="보고파" className="h-6 w-auto object-contain" />
            <span className="font-headline text-xl font-bold tracking-tight text-[#4a626d]">Bogopa</span>
          </Link>
          <UserProfileMenu />
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-6 pb-28 pt-[calc(6rem+env(safe-area-inset-top))] md:pt-[calc(8rem+env(safe-area-inset-top))]">
        <h1 className="font-headline mb-3 text-3xl font-extrabold tracking-tight text-[#2f342e]">데이터 삭제 안내</h1>
        <p className="mb-8 text-sm leading-relaxed text-[#4f5a53]">
          본 페이지는 아티룸이 제공하는 AI 컴패니언 서비스 <strong>보고파(Bogopa)</strong>에서 계정을 삭제하지 않고
          데이터의 일부 또는 전체 삭제를 요청하는 방법을 안내합니다.
        </p>

        <section className="mb-8 space-y-3 rounded-2xl border border-[#d9dfdb] bg-white/70 p-5">
          <h2 className="text-base font-bold text-[#4a626d]">1. 앱에서 직접 삭제하는 방법</h2>
          <ol className="list-inside list-decimal space-y-2 text-sm leading-relaxed text-[#2f342e]">
            {appDeleteSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </section>

        <section className="mb-8 space-y-3 rounded-2xl border border-[#d9dfdb] bg-white/70 p-5">
          <h2 className="text-base font-bold text-[#4a626d]">2. 고객 문의로 삭제 요청하는 방법</h2>
          <ol className="list-inside list-decimal space-y-2 text-sm leading-relaxed text-[#2f342e]">
            {requestSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <p className="text-sm font-semibold text-[#2f342e]">문의: artiroom176@gmail.com</p>
        </section>

        <section className="mb-8 space-y-3 rounded-2xl border border-[#d9dfdb] bg-white/70 p-5">
          <h2 className="text-base font-bold text-[#4a626d]">3. 삭제 가능한 데이터 유형</h2>
          <ul className="list-inside list-disc space-y-2 text-sm leading-relaxed text-[#2f342e]">
            {deletableData.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <section className="space-y-3 rounded-2xl border border-[#d9dfdb] bg-white/70 p-5">
          <h2 className="text-base font-bold text-[#4a626d]">4. 보관되는 데이터 및 보관 기간</h2>
          <ul className="list-inside list-disc space-y-2 text-sm leading-relaxed text-[#2f342e]">
            {retainedData.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <p className="pt-1 text-sm leading-relaxed text-[#4f5a53]">최종 업데이트: 2026-04-01</p>
        </section>
      </main>
    </div>
  );
}
