import Link from "next/link";
import UserProfileMenu from "@/app/_components/UserProfileMenu";
import LegalMobileHeader from "@/app/_components/LegalMobileHeader";
import LegalExitScrollMarker from "@/app/_components/LegalExitScrollMarker";

export default function AccountDeletionPage() {
  const deleteSteps = [
    "보고파 앱 실행 후 로그인",
    "하단 네비게이션에서 프로필 진입",
    "\"계정 정보 및 설정\" 페이지로 이동",
    "\"탈퇴하기\" 선택 후 안내에 따라 탈퇴 문구 입력",
    "최종 확인을 완료하면 계정 삭제 요청이 접수됩니다.",
  ];

  const deletedData = [
    "계정 프로필 정보(이름, 생년월일, 성별, MBTI, 관심사)",
    "내 기억(페르소나) 데이터(관계/설정/기억 조각/자주 쓰는 문구/이미지 포함)",
    "채팅 메시지 및 편지 보관함 데이터",
    "출석체크 상태, 기억 잔액/사용 내역(법적 보관 대상 제외)",
  ];

  const retainedData = [
    "전자상거래법 등 관련 법령에 따른 거래/결제 기록: 최대 5년",
    "소비자 불만 또는 분쟁처리 기록: 최대 3년",
    "표시·광고 관련 기록: 최대 6개월",
    "통신사실확인자료(접속기록): 최대 3개월",
  ];

  return (
    <div className="flex min-h-screen flex-col bg-[#faf9f5] text-[#2f342e]">
      <LegalExitScrollMarker />
      <LegalMobileHeader title="계정 삭제 안내" backHref="/" />

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
        <h1 className="font-headline mb-3 text-3xl font-extrabold tracking-tight text-[#2f342e]">계정 삭제 안내</h1>
        <p className="mb-8 text-sm leading-relaxed text-[#4f5a53]">
          본 페이지는 아티룸이 제공하는 AI 컴패니언 서비스 <strong>보고파(Bogopa)</strong>의 계정 및 관련 데이터 삭제 방법을 안내합니다.
        </p>

        <section className="mb-8 space-y-3 rounded-2xl border border-[#d9dfdb] bg-white/70 p-5">
          <h2 className="text-base font-bold text-[#4a626d]">1. 계정 삭제 요청 방법</h2>
          <ol className="list-inside list-decimal space-y-2 text-sm leading-relaxed text-[#2f342e]">
            {deleteSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <p className="text-sm leading-relaxed text-[#2f342e]">
            앱 접근이 어려운 경우 아래 문의처로 계정 삭제를 요청할 수 있습니다.
          </p>
          <p className="text-sm font-semibold text-[#2f342e]">문의: artiroom176@gmail.com</p>
        </section>

        <section className="mb-8 space-y-3 rounded-2xl border border-[#d9dfdb] bg-white/70 p-5">
          <h2 className="text-base font-bold text-[#4a626d]">2. 삭제 처리 기준</h2>
          <ul className="list-inside list-disc space-y-2 text-sm leading-relaxed text-[#2f342e]">
            <li>탈퇴 요청이 완료되면 계정은 즉시 비활성화됩니다.</li>
            <li>비활성화된 계정의 일반 서비스 데이터는 지체 없이 삭제 절차를 진행합니다.</li>
            <li>단, 법령상 보관 의무가 있는 정보는 해당 기간 동안 분리 보관 후 파기됩니다.</li>
          </ul>
        </section>

        <section className="mb-8 space-y-3 rounded-2xl border border-[#d9dfdb] bg-white/70 p-5">
          <h2 className="text-base font-bold text-[#4a626d]">3. 삭제되는 데이터</h2>
          <ul className="list-inside list-disc space-y-2 text-sm leading-relaxed text-[#2f342e]">
            {deletedData.map((item) => (
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
