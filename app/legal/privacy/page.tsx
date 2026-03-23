import Link from "next/link";

export default function PrivacyPage() {
    return (
        <div className="flex min-h-screen flex-col bg-[#faf9f5] text-[#2f342e]">
            <header className="fixed top-0 z-50 w-full border-b border-[#afb3ac]/25 bg-[#faf9f5]/80 backdrop-blur-xl">
                <div className="mx-auto flex h-16 w-full max-w-3xl items-center px-6">
                    <Link href="/" className="flex items-center gap-2">
                        <img src="/logo/bogopa%20logo.png" alt="보고파" className="h-6 w-auto object-contain" />
                        <span className="font-headline text-xl font-bold tracking-tight text-[#4a626d]">Bogopa</span>
                    </Link>
                </div>
            </header>

            <main className="mx-auto w-full max-w-3xl px-6 pb-28 pt-32">
                <h1 className="font-headline mb-10 text-3xl font-extrabold tracking-tight text-[#2f342e]">개인정보 수집·이용 동의</h1>

                <div className="space-y-8 text-sm leading-relaxed text-white">
                    <section className="space-y-3">
                        <h2 className="text-base font-bold text-[#4a626d]">1. 수집하는 개인정보 항목</h2>
                        <p>보고파 서비스 제공을 위해 아래와 같은 개인정보를 수집 및 이용합니다.</p>
                        <ul className="list-inside list-disc space-y-2">
                            <li><strong>필수 항목:</strong> 이용자의 성명, 성별, 대화 대상의 이름(혹은 애칭), 대상의 직업, 성별 및 입력하신 텍스트/대화 기록.</li>
                            <li><strong>선택 항목:</strong> 대화 대상의 이미지 (아바타용 이미지).</li>
                        </ul>
                    </section>

                    <section className="space-y-3">
                        <h2 className="text-base font-bold text-[#4a626d]">2. 수집 및 이용 목적</h2>
                        <p>
                            입력하신 텍스트 및 대화 기록은 오직 <strong className="text-[#4a626d]">AI 페르소나를 분석하고 생성하기 위한 목적</strong>으로만 처리되며, 분석이 완료된 이후 페르소나와의 대화를 유지하는 용도로 사용됩니다.
                            입력된 대화 데이터는 어떠한 경우에도 외부 제3자 AI 모델 학습에 영구적으로 제공되지 않으며, 세션이 종료되면 설정된 주기에 따라 파기됩니다.
                        </p>
                    </section>

                    <section className="space-y-3">
                        <h2 className="text-base font-bold text-[#4a626d]">3. 개인정보의 보유 및 이용기간</h2>
                        <p>
                            원칙적으로 이용자의 명시적인 삭제 요청(내 기억 삭제) 시 즉시 파기하며, 그렇지 않은 경우에는 서비스 환경의 로컬 스토리지 한도 내지는 1년이 경과하는 시점에서 자동 파기됩니다. 단, 관련 법령에 의해 보존할 필요가 있는 경우에는 해당 법령이 정한 기간 동안 보관합니다.
                        </p>
                    </section>

                    <section className="space-y-3">
                        <h2 className="text-base font-bold text-[#4a626d]">4. 동의를 거부할 권리</h2>
                        <p>
                            이용자는 개인정보 수집 및 이용에 대한 동의를 거부할 권리가 있습니다. 단, 필수 정보 수집에 동의하지 않을 경우 보고파 서비스의 핵심 기능인 '페르소나 생성 및 대화 기능'을 이용하실 수 없습니다.
                        </p>
                    </section>
                </div>
            </main>
        </div>
    );
}
