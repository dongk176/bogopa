import Link from "next/link";
import UserProfileMenu from "@/app/_components/UserProfileMenu";
import LegalMobileHeader from "@/app/_components/LegalMobileHeader";
import LegalExitScrollMarker from "@/app/_components/LegalExitScrollMarker";

type Article = {
    title: string;
    paragraphs?: string[];
    bullets?: string[];
};

type Chapter = {
    title: string;
    articles: Article[];
};

type TermsPageProps = {
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

export default async function TermsPage({ searchParams }: TermsPageProps) {
    const resolvedSearchParams = searchParams instanceof Promise ? await searchParams : searchParams;
    const backHref = resolveBackHref(resolvedSearchParams?.back);
    const chapters: Chapter[] = [
        {
            title: "제1장 총칙",
            articles: [
                {
                    title: "제1조 (약관의 제정 목적)",
                    paragraphs: [
                        "본 약관은 아티룸(이하 \"회사\"라 합니다)이 제공하는 AI 컴패니언 서비스 '보고파'(이하 \"서비스\"라 합니다)의 이용과 관련하여, 회사와 이용자 간의 권리, 의무, 책임 사항 및 기타 필요한 사항을 규정함을 목적으로 합니다.",
                    ],
                },
                {
                    title: "제2조 (용어의 뜻)",
                    bullets: [
                        "\"서비스\"란 단말기(PC, 휴대형 단말기 등)와 상관없이 회원이 이용할 수 있는 '보고파' 관련 제반 서비스를 의미합니다.",
                        "\"회원\"이란 서비스에 접속하여 본 약관에 동의하고 회사가 제공하는 서비스를 이용하는 고객을 의미합니다.",
                        "\"기억패스\"란 회원이 서비스 내에서 추가적인 기능이나 혜택을 누리기 위해 결제하는 구독형 유료 상품을 의미합니다.",
                        "\"AI 컴패니언\"이란 인공지능 기술을 기반으로 사용자의 기억과 대화 맥락을 파악하여 상호작용하는 가상의 대화 주체를 의미합니다.",
                    ],
                },
                {
                    title: "제3조 (약관의 효력 발생 및 변경 안내)",
                    paragraphs: [
                        "회사는 본 약관의 내용을 회원이 쉽게 알 수 있도록 서비스 초기 화면이나 연결 화면을 통해 게시합니다.",
                        "회사는 관련 법령을 위배하지 않는 범위에서 본 약관을 개정할 수 있으며, 개정 시 적용 일자 및 개정 사유를 명시하여 적용 일자 7일 전부터 공지합니다. 단, 회원에게 불리한 변경의 경우 30일 전에 공지하고 개별 통지합니다.",
                    ],
                },
                {
                    title: "제4조 (약관 외 준칙)",
                    paragraphs: ["본 약관에서 정하지 아니한 사항이나 해석에 대해서는 관련 법령 및 상관례에 따릅니다."],
                },
            ],
        },
        {
            title: "제2장 서비스 이용 계약 및 정보 관리",
            articles: [
                {
                    title: "제5조 (이용 계약의 성립)",
                    paragraphs: [
                        "이용 계약은 회원이 되려는 자가 약관 내용에 동의하고 가입 신청을 한 뒤, 회사가 이를 승낙함으로써 성립됩니다.",
                        "만 14세 미만의 아동이 서비스를 이용하고자 하는 경우, 반드시 법정대리인(부모 등)의 사전 동의를 거쳐야 하며, 동의 절차를 누락하거나 허위로 진행한 경우 회사는 즉시 이용 계약을 해지할 수 있습니다.",
                    ],
                },
                {
                    title: "제6조 (계정 생성 및 보안의무)",
                    paragraphs: [
                        "회원은 자신의 계정 및 비밀번호에 대한 관리 책임을 지며, 제3자에게 이를 양도하거나 대여할 수 없습니다. 회원의 관리 소홀로 발생한 손해에 대해 회사는 책임지지 않습니다.",
                    ],
                },
                {
                    title: "제7조 (프로필 및 정보의 현행화)",
                    paragraphs: [
                        "회원은 가입 시 기재한 정보가 변경되었을 경우, 즉시 서비스 내 설정 화면을 통해 수정해야 합니다.",
                    ],
                },
                {
                    title: "제8조 (개인정보의 보호 및 관리)",
                    paragraphs: [
                        "회사는 관련 법령이 정하는 바에 따라 회원의 개인정보를 보호하기 위해 노력합니다.",
                        "회사는 회원이 AI와 나눈 대화 내용(감정, 기억, 사적인 정보 등)을 외부 AI 모델의 재학습(Fine-Tuning 등)이나 서비스 고도화를 위한 학습 데이터로 절대 사용하지 않습니다. 회원의 모든 대화 데이터는 오직 해당 회원의 원활한 서비스 이용 및 맞춤형 대화 제공을 위해서만 안전하게 처리됩니다.",
                    ],
                },
            ],
        },
        {
            title: "제3장 서비스의 이용 및 AI의 특성",
            articles: [
                {
                    title: "제9조 (보고파 서비스의 내용 및 변경)",
                    paragraphs: [
                        "회사는 회원이 입력한 기억과 감정을 바탕으로 AI가 먼저 대화를 건네거나 상호작용하는 컴패니언 서비스를 제공합니다.",
                    ],
                },
                {
                    title: "제10조 (인공지능(AI) 대화 서비스의 특성 및 한계)",
                    paragraphs: [
                        "본 서비스는 OpenAI 등 외부 서드파티 제공자의 AI 엔진(API)을 기반으로 구동됩니다. 따라서 외부 업체의 정책 변경이나 서버 상태에 따라 서비스 품질이 영향을 받을 수 있습니다.",
                        "생성형 AI의 특성상 부정확하거나 예상치 못한 답변(할루시네이션)이 발생할 수 있으며, 회사는 생성된 답변의 정확성, 신뢰성, 완전성을 보증하지 않습니다.",
                        "AI와의 대화는 전문적인 심리 상담이나 의료적 진단을 대체할 수 없으며, 회원이 AI의 답변에 의존하여 내린 결정이나 행동에 대해 회사는 법적 책임을 지지 않습니다.",
                    ],
                },
                {
                    title: "제11조 (맞춤형 정보 및 광고의 제공)",
                    paragraphs: ["회사는 서비스 운영과 관련하여 서비스 화면, 알림 등을 통해 맞춤형 정보 및 광고를 게재할 수 있습니다."],
                },
                {
                    title: "제12조 (유료 서비스의 이용 및 결제)",
                    paragraphs: [
                        "회사는 기본 서비스 외에 인앱 결제 및 구독 형태로 '기억패스' 등 유료 플랜을 제공할 수 있습니다.",
                        "유료 서비스의 이용 요금, 결제 방식, 청약 철회 및 환불 규정은 전자상거래법 등 관련 법령과 회사의 별도 운영 정책에 따릅니다.",
                    ],
                },
            ],
        },
        {
            title: "제4장 계약 당사자의 의무 및 권리",
            articles: [
                {
                    title: "제13조 (회사의 운영 의무)",
                    paragraphs: [
                        "회사는 계속적이고 안정적으로 서비스를 제공하기 위해 최선을 다하며, 설비에 장애가 생기거나 데이터가 멸실된 경우 지체 없이 이를 복구합니다.",
                    ],
                },
                {
                    title: "제14조 (이용자의 올바른 서비스 사용 의무)",
                    paragraphs: [
                        "회원은 서비스를 이용할 때 관계 법령, 본 약관의 규정, 회사가 공지한 주의사항 등을 준수해야 하며, 기타 회사의 업무를 방해하는 행위를 하여서는 안 됩니다.",
                    ],
                },
                {
                    title: "제15조 (이용자에 대한 통지)",
                    paragraphs: [
                        "회사가 회원에 대한 통지를 하는 경우, 회원이 등록한 이메일이나 서비스 내 푸시 알림 등으로 할 수 있습니다.",
                    ],
                },
                {
                    title: "제16조 (게시물 및 대화 데이터의 권리 귀속)",
                    paragraphs: [
                        "회원이 서비스 내에 입력한 프롬프트 및 대화 데이터의 저작권은 회원 본인에게 귀속됩니다. 회사는 서비스 제공의 목적 범위 내에서만 해당 데이터를 임시적으로 처리합니다.",
                    ],
                },
                {
                    title: "제17조 (부적절한 데이터 입력 및 오남용 제재)",
                    paragraphs: [
                        "회원은 AI 시스템을 악용하거나 비정상적인 방법으로 서비스를 이용해서는 안 됩니다.",
                        "회원이 프롬프트 인젝션(탈옥) 등 시스템 취약점을 우회하거나 공격하는 행위, 또는 음란·불법적·폭력적인 대화를 지속적으로 시도하는 경우, 회사는 사전 경고 없이 즉각적으로 해당 회원의 계정을 영구 정지시키고 이용 계약을 해지할 수 있습니다.",
                    ],
                },
            ],
        },
        {
            title: "제5장 계약 해지 및 손해배상",
            articles: [
                {
                    title: "제18조 (이용 제한 및 계약의 해지)",
                    paragraphs: [
                        "회원은 언제든지 서비스 내 설정 메뉴를 통해 이용 계약 해지(회원 탈퇴)를 신청할 수 있습니다.",
                        "회원이 본 약관의 의무를 위반하거나 제17조의 금지 행위를 한 경우, 회사는 즉시 서비스를 제한하거나 계약을 해지할 수 있으며, 이로 인해 발생한 유료 결제 건에 대해서는 환불하지 않습니다.",
                    ],
                },
                {
                    title: "제19조 (책임의 한계 및 면책)",
                    paragraphs: [
                        "회사는 천재지변, 외부 AI 엔진(API)의 서버 장애, 통신망 장애 등 불가항력으로 인하여 서비스를 제공할 수 없는 경우에는 서비스 제공에 관한 책임이 면제됩니다.",
                        "회사는 회원의 귀책사유로 인한 서비스 이용 장애에 대하여 책임을 지지 않습니다.",
                    ],
                },
                {
                    title: "제20조 (손해배상)",
                    paragraphs: [
                        "회사 또는 회원이 본 약관을 위반하여 상대방에게 손해를 입힌 경우, 그 손해를 배상할 책임이 있습니다. 단, 고의 또는 과실이 없는 경우에는 그러하지 아니합니다.",
                    ],
                },
                {
                    title: "제21조 (분쟁의 해결 및 관할 법원)",
                    paragraphs: [
                        "서비스 이용과 관련하여 회사와 회원 간에 발생한 분쟁에 대하여는 양 당사자가 성실히 협의하여 해결하며, 만일 소송이 제기될 경우 민사소송법상의 관할 법원을 전속관할로 합니다.",
                    ],
                },
            ],
        },
    ];

    return (
        <div className="flex min-h-screen flex-col bg-[#faf9f5] text-[#2f342e]">
            <LegalExitScrollMarker />
            <LegalMobileHeader title="서비스 이용약관" backHref={backHref} />

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
                <h1 className="font-headline mb-2 text-3xl font-extrabold tracking-tight text-[#2f342e]">
                    아티룸 '보고파' 서비스 이용약관
                </h1>
                <p className="mb-10 text-sm text-[#4f5a53]">시행일: 2026-04-01</p>

                <div className="space-y-10 text-sm leading-relaxed text-[#2f342e]">
                    {chapters.map((chapter) => (
                        <section key={chapter.title} className="space-y-6">
                            <h2 className="text-lg font-extrabold text-[#2f342e]">{chapter.title}</h2>
                            <div className="space-y-6">
                                {chapter.articles.map((article) => (
                                    <article key={article.title} className="space-y-3">
                                        <h3 className="text-base font-bold text-[#4a626d]">{article.title}</h3>
                                        {(article.paragraphs || []).map((paragraph, index) => (
                                            <p key={`${article.title}-p-${index}`}>{paragraph}</p>
                                        ))}
                                        {(article.bullets || []).length > 0 ? (
                                            <ul className="list-inside list-disc space-y-2">
                                                {article.bullets?.map((bullet, index) => (
                                                    <li key={`${article.title}-b-${index}`}>{bullet}</li>
                                                ))}
                                            </ul>
                                        ) : null}
                                    </article>
                                ))}
                            </div>
                        </section>
                    ))}
                </div>
            </main>
        </div>
    );
}
