import Link from "next/link";
import UserProfileMenu from "@/app/_components/UserProfileMenu";
import LegalMobileHeader from "@/app/_components/LegalMobileHeader";
import LegalExitScrollMarker from "@/app/_components/LegalExitScrollMarker";

export default function TermsPage() {
    return (
        <div className="flex min-h-screen flex-col bg-[#faf9f5] text-[#2f342e]">
            <LegalExitScrollMarker />
            <LegalMobileHeader title="서비스 이용약관" />

            <header className="fixed top-0 z-50 hidden w-full border-b border-[#afb3ac]/25 bg-[#faf9f5]/80 backdrop-blur-xl md:block">
                <div className="mx-auto flex h-16 w-full max-w-3xl items-center justify-between px-6">
                    <Link href="/" className="flex items-center gap-2">
                        <img src="/logo/bogopa%20logo.png" alt="보고파" className="h-6 w-auto object-contain" />
                        <span className="font-headline text-xl font-bold tracking-tight text-[#4a626d]">Bogopa</span>
                    </Link>
                    <UserProfileMenu />
                </div>
            </header>

            <main className="mx-auto w-full max-w-3xl px-6 pb-28 pt-24 md:pt-32">
                <h1 className="font-headline mb-10 text-3xl font-extrabold tracking-tight text-[#2f342e]">서비스 이용약관</h1>

                <div className="space-y-8 text-sm leading-relaxed text-white">
                    <section className="space-y-3">
                        <h2 className="text-base font-bold text-[#4a626d]">제 1 조 (목적)</h2>
                        <p>
                            본 약관은 아티룸(이하 "회사")이 제공하는 보고파 서비스(이하 "서비스")의 이용과 관련하여 회사와 회원 간의 권리, 의무, 책임사항 및 기타 필요한 사항을 규정함을 목적으로 합니다.
                        </p>
                    </section>

                    <section className="space-y-3">
                        <h2 className="text-base font-bold text-[#4a626d]">제 2 조 (제공하는 서비스)</h2>
                        <p>
                            회사는 이용자가 입력한 대화 기록 및 정보를 바탕으로 AI 가상 페르소나를 생성하고, 이를 통해 대화를 나눌 수 있는 대화 보조 도구(동반자 서비스)를 제공합니다. 본 서비스가 제공하는 페르소나의 답변은 인공지능에 의해 생성된 가상의 내용으로, 실제 인물의 의견이나 사실을 반영하지 않습니다.
                        </p>
                    </section>

                    <section className="space-y-3">
                        <h2 className="text-base font-bold text-[#4a626d]">제 3 조 (이용자의 의무 및 제한)</h2>
                        <ul className="list-inside list-disc space-y-2">
                            <li>이용자는 본 서비스에 타인의 개인정보, 민감정보, 또는 허락받지 않은 제3자의 대화 기록을 동의 없이 입력해서는 안 됩니다.</li>
                            <li>생성된 AI 페르소나의 대화 내용을 바탕으로 법적 책임을 묻거나, 의료/심리적 치료의 대체재로 사용할 수 없습니다.</li>
                            <li>욕설, 비방, 범죄 악용 등을 목적으로 서비스를 이용하는 경우, 회사는 즉시 서비스 이용을 제한할 수 있습니다.</li>
                        </ul>
                    </section>

                    <section className="space-y-3">
                        <h2 className="text-base font-bold text-[#4a626d]">제 4 조 (면책조항)</h2>
                        <p>
                            회사는 무료로 제공되는 본 서비스의 완전성, 정확성을 보증하지 않으며, AI가 생성한 오해의 소지가 있는 답변으로 인해 발생한 정신적, 물리적 손해에 대해 배상할 책임을 지지 않습니다.
                        </p>
                    </section>
                </div>
            </main>
        </div>
    );
}
