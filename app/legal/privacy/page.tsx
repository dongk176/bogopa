import Link from "next/link";
import UserProfileMenu from "@/app/_components/UserProfileMenu";
import LegalMobileHeader from "@/app/_components/LegalMobileHeader";
import LegalExitScrollMarker from "@/app/_components/LegalExitScrollMarker";

type PrivacyPageProps = {
    searchParams?:
    | Record<string, string | string[] | undefined>
    | Promise<Record<string, string | string[] | undefined>>;
};

function resolveBackHref(backValue: string | string[] | undefined) {
    const raw = Array.isArray(backValue) ? backValue[0] : backValue;
    if (!raw || !raw.startsWith("/")) return "/profile/account-settings";
    if (raw.startsWith("/api/")) return "/profile/account-settings";
    if (raw.startsWith("/auth/")) return "/profile/account-settings";
    return raw;
}

export default async function PrivacyPage({ searchParams }: PrivacyPageProps) {
    const resolvedSearchParams = searchParams instanceof Promise ? await searchParams : searchParams;
    const backHref = resolveBackHref(resolvedSearchParams?.back);
    const sections: Array<{
        title: string;
        paragraphs?: string[];
        bullets?: string[];
    }> = [
            {
                title: "1. 총칙",
                paragraphs: [
                    "보고파(이하 \"회사\")는 이용자의 개인정보를 중요하게 생각하며, 「개인정보 보호법」 등 관련 법령을 준수합니다.",
                    "본 개인정보 처리방침은 회사가 제공하는 웹/앱 서비스(로그인, 회원가입, 내 기억 생성·관리, AI 대화, 편지 기능, 출석체크, 유료 상품 이용 등)에서 수집·이용·보관·파기되는 개인정보 처리 기준을 설명합니다.",
                    "본 처리방침은 서비스 화면 하단 또는 계정 설정 메뉴를 통해 언제든지 확인할 수 있습니다.",
                ],
            },
            {
                title: "2. 수집하는 개인정보 항목",
                paragraphs: ["회사는 서비스 제공을 위해 아래 정보를 수집·처리할 수 있습니다."],
                bullets: [
                    "계정 및 인증 정보: 사용자 식별값(ID), 로그인 제공자(provider), 이름, 이메일, 프로필 이미지, 인증 처리에 필요한 토큰/식별값",
                    "연락처 정보: 이메일 주소, 문의 응대 시 이용자가 제공한 연락 정보",
                    "식별자: 서비스 사용자 ID, 로그인 제공자별 식별값, 서비스 세션 식별값",
                    "회원 프로필 정보: 이름, 생년월일, 성별, MBTI, 관심사, 프로필 완료 여부",
                    "내 기억(페르소나) 정보: 기억 이름, 관계, 성별 관련 설정, 소개 입력값, 프로필 이미지, 대화 스타일·성향 설정, 자주 쓰는 문구, 기억 조각, 대화 목적 등 이용자가 직접 입력한 데이터",
                    "대화/콘텐츠 정보: 채팅 메시지(이용자/AI), 대화 세션 요약 정보, 편지 설정 및 편지 본문, 후기/피드백, 서비스 내 입력한 기타 텍스트",
                    "구입 항목 정보: 구독/충전 등 권한(Entitlement) 상태, 스토어 영수증 관련 거래 식별값, 결제 검증 결과",
                    "사용 데이터: 출석체크 기록, 기능 이용 이력, 기억 잔액/변동 내역, 서비스 내 행동 로그, 접속 시간 등 운영 로그",
                    "진단 정보: 앱 오류, 비정상 종료 관련 오류 정보, 성능 측정값(예: 실행 시간, 응답 지연) 등 서비스 안정성 개선을 위한 기술 정보",
                ],
            },
            {
                title: "3. 개인정보 수집 방법",
                bullets: [
                    "회원가입 및 로그인(카카오/구글/애플/아이디·비밀번호) 과정에서 수집",
                    "이용자가 서비스 화면에서 직접 입력·업로드(텍스트, 이미지)한 정보 수집",
                    "API 호출, 로그 기록, 쿠키/세션/로컬스토리지 등 기술적 수단을 통한 자동 수집",
                    "결제/구독 처리 시 앱마켓(구글 플레이/애플 앱스토어) 연동 과정에서 필요한 범위 내 수집",
                ],
            },
            {
                title: "4. 개인정보 이용 목적",
                bullets: [
                    "회원 식별, 로그인 상태 유지, 계정 보호 및 부정 이용 방지",
                    "내 기억 생성·편집, AI 대화 생성, 편지 생성·보관 등 핵심 기능 제공",
                    "출석체크, 기억 충전/차감, 구독 상태 반영, 결제 검증 및 권한 부여",
                    "서비스 안정성 확보, 오류 분석, 품질 개선, 고객 문의 대응",
                    "법령 준수, 분쟁 대응, 이용약관·운영정책 위반 행위 대응",
                ],
            },
            {
                title: "5. 제3자 제공에 관한 사항",
                paragraphs: [
                    "회사는 원칙적으로 이용자의 개인정보를 외부에 판매하거나 무단 제공하지 않습니다.",
                    "다만, 이용자가 사전에 동의한 경우, 법령에 근거가 있는 경우, 또는 수사·재판 등 적법한 절차에 따라 요구되는 경우에는 예외적으로 제공될 수 있습니다.",
                ],
            },
            {
                title: "6. 처리위탁 및 국외 이전",
                paragraphs: [
                    "회사는 서비스 제공을 위해 일부 업무를 외부 서비스에 위탁하거나 국외 인프라를 이용할 수 있습니다. 회사는 계약을 통해 개인정보 보호 의무를 관리·감독합니다.",
                ],
                bullets: [
                    "인증/로그인 연동: 카카오, 구글, 애플",
                    "클라우드/저장소: Supabase(데이터베이스), AWS S3(이미지 저장)",
                    "AI 응답 생성 처리: OpenAI API",
                    "앱 내 결제 처리: Google Play / Apple App Store 결제 시스템",
                    "국외 이전은 각 서비스 사업자의 운영 인프라 위치에 따라 발생할 수 있으며, 서비스 제공 목적 범위 내에서 최소한으로 처리됩니다.",
                ],
            },
            {
                title: "7. 보유 및 이용 기간",
                paragraphs: [
                    "회사는 원칙적으로 개인정보 수집·이용 목적 달성 시 지체 없이 파기합니다. 다만 이용자가 계정을 유지하는 동안 서비스 제공 목적상 필요한 정보는 보관될 수 있습니다.",
                    "이용자가 회원탈퇴를 요청하면 관련 데이터는 법령상 보관 의무가 없는 범위에서 지체 없이 삭제됩니다.",
                    "관계 법령에 따라 보관이 필요한 경우 아래 기간 동안 보관 후 파기합니다.",
                ],
                bullets: [
                    "계약 또는 청약철회 등에 관한 기록: 5년",
                    "대금결제 및 재화·서비스 공급에 관한 기록: 5년",
                    "소비자 불만 또는 분쟁처리에 관한 기록: 3년",
                    "표시·광고에 관한 기록: 6개월",
                    "통신사실확인자료(접속기록 등): 3개월",
                ],
            },
            {
                title: "8. 파기 절차 및 방법",
                bullets: [
                    "전자적 파일: 복구 또는 재생이 어려운 방식으로 안전하게 삭제",
                    "출력물/문서: 분쇄 또는 소각 등으로 파기",
                    "법령상 보관 정보는 별도 분리 보관 후 보관 기간 종료 시 즉시 파기",
                ],
            },
            {
                title: "9. 이용자 권리와 행사 방법",
                bullets: [
                    "이용자는 언제든지 본인의 개인정보 열람, 정정, 처리정지, 회원탈퇴를 요청할 수 있습니다.",
                    "서비스 내 메시지/내 기억의 개별 삭제는 제공하지 않으며, 데이터 삭제는 계정 탈퇴 시 일괄 처리됩니다.",
                    "앱 내 계정 설정 또는 고객 문의 채널을 통해 요청할 수 있으며, 회사는 관련 법령이 정한 기간 내 조치합니다.",
                    "법령상 제한 사유가 있는 경우 일부 요청이 제한될 수 있습니다.",
                ],
            },
            {
                title: "10. 자동 수집 장치(쿠키·세션·로컬스토리지)",
                paragraphs: [
                    "회사는 로그인 유지, 보안 처리, 이용 환경 개선을 위해 쿠키·세션·로컬스토리지 등을 사용할 수 있습니다.",
                    "이용자는 브라우저 또는 기기 설정을 통해 쿠키 저장을 거부할 수 있으나, 이 경우 일부 기능 이용이 제한될 수 있습니다.",
                ],
            },
            {
                title: "11. 아동의 개인정보",
                paragraphs: [
                    "회사는 만 14세 미만 아동의 가입을 제한합니다. 연령 기준 미충족 시 서비스 이용이 제한될 수 있습니다.",
                ],
            },
            {
                title: "12. 개인정보 보호를 위한 기술적·관리적 조치",
                bullets: [
                    "접근 권한 최소화 및 권한 관리",
                    "민감 데이터 접근 통제, 전송 구간 보안 적용",
                    "로그 모니터링, 이상 행위 탐지, 취약점 점검",
                    "내부 운영자 대상 보안·개인정보 보호 기준 적용",
                ],
            },
            {
                title: "13. 개인정보 보호책임자 및 문의처",
                paragraphs: [
                    "개인정보 처리 관련 문의, 불만 처리, 피해 구제 요청은 아래 채널로 접수하실 수 있습니다.",
                ],
                bullets: [
                    "이메일: artiroom176@gmail.com",
                    "문의 내용 확인 후 관련 법령 및 내부 절차에 따라 신속히 답변드립니다.",
                ],
            },
            {
                title: "14. App Store 개인정보 라벨 기준 안내",
                paragraphs: [
                    "회사는 App Store에 고지한 개인정보 라벨 기준에 따라 수집 항목을 아래와 같이 분류할 수 있습니다.",
                ],
                bullets: [
                    "사용자를 추적하는 데 사용되는 데이터: 해당 없음",
                    "사용자에게 연결된 데이터: 사용자 콘텐츠, 연락처 정보, 구입 항목, 사용 데이터, 식별자, 진단",
                    "사용자에게 연결되지 않은 데이터: 해당 없음(현재 운영 기준)",
                    "앱은 광고 목적의 교차 앱/웹 추적을 수행하지 않으며, ATT 권한이 필요한 방식의 추적 기능을 사용하지 않습니다.",
                ],
            },
            {
                title: "15. 고지 의무",
                paragraphs: [
                    "본 개인정보 처리방침은 관련 법령, 서비스 내용, 보안 정책 변경에 따라 수정될 수 있습니다.",
                    "중요한 변경사항이 있는 경우 서비스 내 공지사항 또는 별도 안내를 통해 고지합니다.",
                    "시행일: 2026-04-01",
                ],
            },
        ];

    return (
        <div className="flex min-h-screen flex-col bg-[#faf9f5] text-[#2f342e]">
            <LegalExitScrollMarker />
            <LegalMobileHeader title="개인정보 처리방침" backHref={backHref} />

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
                <h1 className="font-headline mb-10 text-3xl font-extrabold tracking-tight text-[#2f342e]">개인정보 처리방침</h1>

                <div className="space-y-8 text-sm leading-relaxed text-[#2f342e]">
                    {sections.map((section) => (
                        <section key={section.title} className="space-y-3">
                            <h2 className="text-base font-bold text-[#4a626d]">{section.title}</h2>
                            {(section.paragraphs || []).map((paragraph, index) => (
                                <p key={`${section.title}-p-${index}`}>{paragraph}</p>
                            ))}
                            {(section.bullets || []).length > 0 ? (
                                <ul className="list-inside list-disc space-y-2">
                                    {section.bullets?.map((bullet, index) => (
                                        <li key={`${section.title}-b-${index}`}>{bullet}</li>
                                    ))}
                                </ul>
                            ) : null}
                        </section>
                    ))}
                </div>
            </main>
        </div>
    );
}
