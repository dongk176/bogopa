import Link from "next/link";

export const metadata = {
    title: "고객지원 | Bogopa",
    description: "보고파 고객지원, 결제/환불 안내, 계정 및 데이터 삭제 안내",
};

const CONTACT_EMAIL = "artiroom176@gmail.com";
const SUPPORT_SUBJECT = "[보고파 고객지원] 문의";
const SUPPORT_MAILTO_HREF = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(SUPPORT_SUBJECT)}`;

const policyLinks = [
    { href: "/legal/terms", label: "서비스 이용약관" },
    { href: "/legal/privacy", label: "개인정보 처리방침" },
    { href: "/legal/account-deletion", label: "계정 삭제 안내" },
    { href: "/legal/data-deletion", label: "데이터 삭제 안내" },
];

export default function SupportPage() {
    return (
        <div className="min-h-screen bg-[#faf9f5] text-[#2f342e]">
            <header className="sticky top-0 z-40 border-b border-[#d9dfdb] bg-[#faf9f5]/95 backdrop-blur">
                <div className="mx-auto flex w-full max-w-4xl items-center justify-between px-5 py-4 md:px-8">
                    <Link href="/" className="flex items-center gap-2">
                        <img src="/logo/bogopa%20logo.png" alt="보고파" className="h-6 w-auto object-contain" />
                        <span className="font-headline text-lg font-bold tracking-tight text-[#4a626d]">Bogopa 고객지원</span>
                    </Link>
                    <Link href="/" className="rounded-xl border border-[#d9dfdb] bg-white px-3 py-1.5 text-xs font-semibold text-[#4a626d] hover:bg-[#f4f8fa]">
                        홈으로
                    </Link>
                </div>
            </header>

            <main className="mx-auto w-full max-w-4xl px-5 pb-20 pt-8 md:px-8 md:pt-10">
                <section className="rounded-3xl border border-[#d9dfdb] bg-white p-6 md:p-8">
                    <h1 className="font-headline text-3xl font-extrabold tracking-tight text-[#2f342e] md:text-4xl">고객지원</h1>
                    <p className="mt-3 text-sm leading-relaxed text-[#4f5a53]">
                        문의, 결제/환불, 계정/데이터 삭제 관련 안내를 한 곳에서 확인하고 바로 지원 요청할 수 있습니다.
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                        <a
                            href={SUPPORT_MAILTO_HREF}
                            className="rounded-xl border border-[#d9dfdb] bg-[#f4f8fa] px-3 py-2 text-xs font-bold text-[#2f342e] hover:bg-[#e9f1f5]"
                        >
                            문의 메일 보내기
                        </a>
                        <Link
                            href="/legal/account-deletion"
                            className="rounded-xl border border-[#d9dfdb] bg-[#f4f8fa] px-3 py-2 text-xs font-bold text-[#2f342e] hover:bg-[#e9f1f5]"
                        >
                            계정 삭제 방법 보기
                        </Link>
                    </div>
                </section>

                <section className="mt-5 rounded-3xl border border-[#d9dfdb] bg-white p-6 md:p-8">
                    <h2 className="text-base font-bold text-[#4a626d] md:text-lg">문의 채널 (Support Contact)</h2>
                    <div className="mt-4 space-y-3 text-sm leading-relaxed text-[#2f342e]">
                        <p>
                            이메일:{" "}
                            <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold text-[#4a626d] underline underline-offset-4">
                                {CONTACT_EMAIL}
                            </a>
                        </p>
                        <p>운영시간: 평일 10:00 ~ 18:00 (KST), 주말/공휴일 휴무</p>
                        <p>답변 기준: 접수 후 영업일 1~3일 내 순차 답변</p>
                        <p className="text-xs text-[#5f6a63]">
                            빠른 확인을 위해 문의 시 앱 버전, 로그인 방식, 문제 발생 시각, 스크린샷을 함께 보내주세요.
                        </p>
                    </div>
                </section>

                <section className="mt-5 rounded-3xl border border-[#d9dfdb] bg-white p-6 md:p-8">
                    <h2 className="text-base font-bold text-[#4a626d] md:text-lg">환불/결제 문의</h2>
                    <div className="mt-4 space-y-3 text-sm leading-relaxed text-[#2f342e]">
                        <p>결제 오류, 중복 결제, 환불 가능 여부 확인은 고객지원 이메일로 접수해 주세요.</p>
                        <p>
                            인앱 결제 환불은 Apple/Google 스토어 정책이 우선 적용됩니다. 상세 조건은{" "}
                            <Link href="/payment" className="font-semibold text-[#4a626d] underline underline-offset-4">
                                기억 스토어 내 환불 정책
                            </Link>
                            에서 확인할 수 있습니다.
                        </p>
                        <p className="text-xs text-[#5f6a63]">
                            Apple 환불은 App Store 구매 내역에서, Google 환불은 Play 결제 내역에서 직접 요청할 수 있습니다.
                        </p>
                    </div>
                </section>

                <section className="mt-5 rounded-3xl border border-[#d9dfdb] bg-white p-6 md:p-8">
                    <h2 className="text-base font-bold text-[#4a626d] md:text-lg">계정 및 데이터 삭제</h2>
                    <div className="mt-4 space-y-3 text-sm leading-relaxed text-[#2f342e]">
                        <p>메시지/내 기억의 개별 삭제는 제공하지 않으며, 데이터 삭제는 계정 탈퇴 시 일괄 처리됩니다.</p>
                        <p>앱 내 설정에서 계정 삭제를 진행할 수 있으며, 앱 접근이 어려운 경우 이메일로 요청할 수 있습니다.</p>
                        <div className="flex flex-wrap gap-2">
                            <Link href="/legal/account-deletion" className="rounded-xl border border-[#d9dfdb] bg-[#f9fcff] px-3 py-1.5 text-xs font-semibold text-[#3e5560] hover:bg-[#eef6fb]">
                                계정 삭제 안내 보기
                            </Link>
                            <Link href="/legal/data-deletion" className="rounded-xl border border-[#d9dfdb] bg-[#f9fcff] px-3 py-1.5 text-xs font-semibold text-[#3e5560] hover:bg-[#eef6fb]">
                                데이터 삭제 안내 보기
                            </Link>
                        </div>
                    </div>
                </section>

                <section className="mt-5 rounded-3xl border border-[#d9dfdb] bg-white p-6 md:p-8">
                    <h2 className="text-base font-bold text-[#4a626d] md:text-lg">약관 및 정책 모음</h2>
                    <ul className="mt-4 grid grid-cols-1 gap-2 text-sm md:grid-cols-2">
                        {policyLinks.map((item) => (
                            <li key={item.href}>
                                <Link href={item.href} className="flex items-center justify-between rounded-xl border border-[#d9dfdb] bg-[#fdfefe] px-4 py-3 font-semibold text-[#2f342e] hover:bg-[#f4f8fa]">
                                    <span>{item.label}</span>
                                    <span className="text-[#4a626d]">보기</span>
                                </Link>
                            </li>
                        ))}
                    </ul>
                    <p className="mt-4 text-xs text-[#6a756f]">마지막 업데이트: 2026-04-11 (KST)</p>
                </section>
            </main>
        </div>
    );
}
