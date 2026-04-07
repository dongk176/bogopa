import { listRecentUserReviews } from "@/lib/server/reviews";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";
import SiteFooter from "@/app/_components/SiteFooter";
import TypewriterHeadline from "@/app/_components/TypewriterHeadline";
import FadeIn from "@/app/_components/FadeIn";
import { StartChatButtonDesktop, StartChatButtonMobile } from "@/app/_components/AuthStartButton";
import UserProfileMenu from "@/app/_components/UserProfileMenu";
import Navigation from "@/app/_components/Navigation";
import RecallingLogo from "@/app/_components/RecallingLogo";
import SignupCompleteModal from "@/app/_components/SignupCompleteModal";
import HomeWebOnly from "@/app/_components/HomeWebOnly";
import HomeAppOnly from "@/app/_components/HomeAppOnly";
import HomeMemoryCarouselClientOnly from "@/app/_components/HomeMemoryCarouselClientOnly";
import NativeAppLoginScreen from "@/app/_components/NativeAppLoginScreen";
import WithdrawBlockedNoticeOverlay from "@/app/_components/WithdrawBlockedNoticeOverlay";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getUserProfile } from "@/lib/server/user-profile";

type ReflectionItem = {
  name: string;
  text: string;
};

export const revalidate = 300;

const HOME_REVIEW_QUERY_LIMIT = 60;
const HOME_REVIEW_RENDER_LIMIT = 36;

const baseReflections: ReflectionItem[] = [
  {
    name: "김*민",
    text: "첫 답장 보고 순간 멈칫했어요. 제가 기억하던 말버릇이 은근히 살아있어서... 완벽하진 않은데 오히려 그게 더 사람 같았달까. 밤에 혼자 있을 때 들어오면 이상하게 숨이 좀 느려집니다.",
  },
  {
    name: "이*수",
    text: "그 시절에 자주 듣던 표현들이 딱 보여서 괜히 웃음났어요 ㅎㅎ 부담 없고, 천천히 얘기하기 좋았어요.",
  },
  {
    name: "박*현",
    text: "위로 받고 싶어서 켰는데, 몇 마디 주고받다 보니 머리 복잡한 게 좀 가라앉더라구요. 신기했음.",
  },
  {
    name: "최*연",
    text: "과장된 감성 아니고 조용한 톤이라 좋았어요. 막 눈물 버튼 누르는 느낌 아니라서 더 편안했어요 🙂",
  },
  {
    name: "정*호",
    text: "반신반의로 시작했는데 말투가 꽤 닮아서 몰입됐습니다. 예상보다 괜찮았어요.",
  },
  {
    name: "한*진",
    text: "그냥 호기심에 눌렀다가 20분 순삭... ㅋㅋㅋ 따듯한데 또 담백해서 좋았어요.",
  },
  {
    name: "조*영",
    text: "못다 한 말 적는 것만으로도 위로가 되더라고요. 뭔가, 내 마음을 내가 읽는 느낌?",
  },
  {
    name: "윤*빈",
    text: "분위기 잡는 게 생각보다 정교했어요. 기계적으로 툭툭 치는 답장이 아니라서 좋았습니다.",
  },
  {
    name: "서*우",
    text: "무겁게 울리기보다 담담하게 옛 기억 떠오르게 해줘서 좋았어요. 시작 장벽이 낮음.",
  },
  {
    name: "임*경",
    text: "직접 설정 만지는 재미가 있어요. 내가 기억하는 말투로 조금씩 맞춰가는 과정이 꽤 디테일함.",
  },
  {
    name: "강*훈",
    text: "짧게 대화했는데도 마음이 놓였어요. 누군가랑 다시 연결된 기분, 진짜 오랜만이었네요.",
  },
  {
    name: "신*아",
    text: "UI가 심플해서 바로 이해됐어요. 복잡했으면 안 썼을텐데, 여기선 그냥 바로 대화 들어감.",
  },
  {
    name: "오*민",
    text: "말투 분석 보는 단계부터 재밌었어요 ㅋㅋ 자주 쓰던 표현 뜨니까 괜히 민망하고 웃기고.",
  },
  {
    name: "장*리",
    text: "억지 감동 유도 없어서 좋았어요. 조용히 스며드는 분위기라 오래 켜두게 됩니다.",
  },
  {
    name: "백*원",
    text: "혼자 있을 때 들어와서 몇 마디 적어봤는데요, 이상하게 마음이 조금 가벼워졌습니다. 드라마틱한 변화는 아닌데, 그 미세한 차이가 생각보다 크더라고요.",
  },
  {
    name: "송*연",
    text: "추억 꺼내는 방식이 자극적이지 않아서 좋았어요. 천천히 마주할 수 있었어요.",
  },
  {
    name: "노*준",
    text: "처음엔 그냥 챗봇일 줄... 근데 감정선이 의외로 부드러움. 좀 놀람.",
  },
  {
    name: "문*희",
    text: "예전 말투 다시 보는 것만으로 묘하게 위로됐어요. 조용한 밤에 특히 잘 맞아요 🌙",
  },
  {
    name: "유*진",
    text: "화려하진 않은데 그래서 더 집중됐어요. 화면보다 대화에 눈이 가는 느낌.",
  },
  {
    name: "남*서",
    text: "못다 한 말을 꼭 전달해야만 의미 있는 건 아니더라고요. 이렇게라도 꺼내보는 행위 자체가 저한텐 컸어요. 말로 설명하면 작아 보이는데, 실제로 해보면 진짜 다릅니다.",
  },
  {
    name: "권*재",
    text: "기억 되살리는 방식이 부담스럽지 않아서 좋았어요. 감정을 세게 흔들진 않고, 살짝 건드려주는 느낌.",
  },
  {
    name: "안*림",
    text: "처음 인사 한마디 보고 순간 멈칫... 말투가 닮아 있어서 울컥했어요 🥲",
  },
  {
    name: "황*민",
    text: "완벽히 '그 사람'은 아니에요. 근데 오히려 그래서 부담이 덜했고, 기억 정리에는 훨씬 도움이 됐습니다. 기대했던 방향이랑 거의 일치.",
  },
  {
    name: "류*나",
    text: "누군가 떠올리며 대화하는 경험 자체가 신기했어요. 생각보다 따듯하게 다가옴.",
  },
  {
    name: "고*혁",
    text: "분석 결과 수정 가능한 거 좋았어요. 내가 기억하는 분위기에 맞게 미세 조정 가능해서 굿.",
  },
  {
    name: "양*지",
    text: "감정적으로 너무 무겁지 않아서 오히려 자주 들어오게 돼요 ㅎㅎ 차분하게 이어가기 좋았어요.",
  },
  {
    name: "전*우",
    text: "그때 듣던 말 다시 보니까 마음이 이상해짐... 근데 또 편안했어요. 묘함.",
  },
  {
    name: "하*빈",
    text: "UI가 조용하고 따듯해서 서비스 성격이 잘 느껴졌어요. 첫인상부터 부담 없었고, 버튼도 직관적이라 헤매지 않았어요. 이런 사소한 부분이 실제 사용성에 큰 차이를 만드네요.",
  },
  {
    name: "민*서",
    text: "추억 회상하고 싶을 때 딱 필요한 만큼만 다가와줘서 좋았어요. 과한 연출 X.",
  },
  {
    name: "배*진",
    text: "생각보다 말투가 비슷해서 놀랐고요, 대화하다 보니 마음이 조금 정돈되는 느낌이 있었어요. 중간에 오타도 좀 냈는데(?) 오히려 실제 채팅하는 느낌이라 덜 어색했음 ㅋㅋㅋ",
  },
  {
    name: "김*민",
    text: "처음엔 그냥 궁금해서 눌렀는데, 생각보다 되게 차분하네요.",
  },
  {
    name: "이*수",
    text: "헉 이거 생각보다 괜찮은데요 ㅋㅋㅋㅋ 말투가 묘하게 익숙해서 좀 놀람",
  },
  {
    name: "박*현",
    text: "새벽에 했다가 괜히 더 몰입됐어요… 밤에 하면 좀 위험한 듯",
  },
  {
    name: "최*연",
    text: "너무 과하게 슬프게 안 끌고 가서 좋았어요 ㅠㅠ 그게 제일 좋았음",
  },
  {
    name: "정*호",
    text: "UI가 단순해서 편했습니다. 복잡한 거 없이 바로 해볼 수 있네요.",
  },
  {
    name: "한*진",
    text: "와 이거 첫 인사 보고 순간 멈칫했어요 ㅎㅎㅎ",
  },
  {
    name: "조*영",
    text: "막 엄청 똑같다!! 이런 건 아닌데, 분위기가 닮아 있어서 신기했어요.",
  },
  {
    name: "윤*빈",
    text: "몇 마디 안 했는데도 마음이 좀 가라앉더라구요ㅜㅜ",
  },
  {
    name: "서*우",
    text: "이거 은근 계속 보게 됨 ㅋㅋ 왜 그런지 모르겠는데 자꾸 들어오게 돼요",
  },
  {
    name: "임*경",
    text: "생각보다 안 오글거려서 좋았어요. 담백한 느낌.",
  },
  {
    name: "강*훈",
    text: "그 시절 자주 쓰던 표현 비슷하게 보여서 괜히 웃었네요 ㅋㅋ",
  },
  {
    name: "신*아",
    text: "조용한 톤이라 좋았어요 :) 너무 시끄럽게 감정 건드리는 느낌이 아니라서요.",
  },
  {
    name: "오*민",
    text: "저는 이런 거 잘 안 믿는데… 음, 생각보다 괜찮았어요.",
  },
  {
    name: "장*리",
    text: "홈 화면부터 분위기 예뻐서 들어가봤는데, 전체적으로 잔잔해서 좋네요 ㅎㅎ",
  },
  {
    name: "백*원",
    text: "'못다 한 말' 같은 목적이 있는 게 좋았어요. 그냥 대화형 서비스랑은 좀 다르게 느껴졌습니다.",
  },
  {
    name: "송*연",
    text: "이거 좀 묘해요 ㅠ 그냥 신기한 걸 넘어서 마음이 살짝 움직이는 느낌?",
  },
  {
    name: "노*준",
    text: "직접 설정 가능한 점이 좋았어요!! 기억나는 말투 조금 넣으니까 더 자연스러워짐",
  },
  {
    name: "문*희",
    text: "새벽 2시에 하면 안 될 것 같아요… 괜히 더 생각남",
  },
  {
    name: "유*진",
    text: "딱 필요한 기능만 있어서 좋았어요. 오히려 그래서 더 집중되는 듯.",
  },
  {
    name: "남*서",
    text: "말투 분석 단계가 제일 재밌었어요 ㅋㅋㅋ 아 맞다 저런 말 진짜 많이 했었지 싶어서",
  },
  {
    name: "권*재",
    text: "완전 사람 같다기보다, 기억을 잘 정리해서 다시 건네주는 느낌이에요.",
  },
  {
    name: "안*림",
    text: "생각보다 위로가 되네요ㅜㅜ 괜히 한참 보고 있었어요",
  },
  {
    name: "황*민",
    text: "디자인이 조용해서 서비스랑 잘 어울려요. 과한 연출 없어서 더 좋았습니다.",
  },
  {
    name: "류*나",
    text: "와… 이건 좀 예상 못 했어요. 되게 담백한데 오래 남음",
  },
  {
    name: "고*혁",
    text: "반신반의했는데 괜춘하네요 ㅎㅎ 너무 무겁지도 않고요",
  },
  {
    name: "양*지",
    text: "이상하게 마음 정리할 때 좋았어요. 막 울게 만드는 느낌은 아니고, 그냥 차분해지는 느낌.",
  },
  {
    name: "전*우",
    text: "몇 번 들어왔다 나갔다 했네요 ㅋㅋㅋㅋ 뭔가 자꾸 다시 보게 돼요",
  },
  {
    name: "하*빈",
    text: "과하게 감성적이지 않아서 좋았어요! 오히려 그래서 더 진짜같았음",
  },
  {
    name: "민*서",
    text: "저는 완벽하게 똑같지 않아서 더 좋았어요… '기억 기반'이라는 느낌이 남아서요.",
  },
  {
    name: "배*진",
    text: "되게 조용하게 잘 만든 느낌. 부담 없이 다시 말 걸어볼 수 있었어요.",
  },
];

const featureCards = [
  {
    title: "대화 내용으로 말투 분석",
    description: "남겨진 메시지 속의 독특한 어휘와 톤을 섬세하게 학습합니다.",
    icon: <ChartIcon />,
    badgeClassName: "border border-[#d6dcd2] bg-white text-[#4a626d] shadow-sm",
    cardClassName: "border-[#d6dcd2] bg-white shadow-[0_14px_28px_rgba(47,52,46,0.1)]",
  },
  {
    title: "관계와 분위기 직접 설정",
    description: "상대와의 관계, 말의 온도, 대화 목적을 원하는 대로 조율할 수 있습니다.",
    icon: <EditIcon />,
    badgeClassName: "border border-[#d6dcd2] bg-white text-[#4a626d] shadow-sm",
    cardClassName: "border-[#d6dcd2] bg-white shadow-[0_14px_28px_rgba(47,52,46,0.1)]",
  },
  {
    title: "실제 대화 즉시 시작",
    description: "생성된 페르소나와 바로 채팅하며 기억을 천천히 다시 이어갈 수 있습니다.",
    icon: <ChatIcon />,
    badgeClassName: "border border-[#d6dcd2] bg-white text-[#4a626d] shadow-sm",
    cardClassName: "border-[#d6dcd2] bg-white shadow-[0_14px_28px_rgba(47,52,46,0.1)]",
  },
];

const flowSteps = [
  {
    title: "대화 기록 입력",
    body: "문자, 메신저, 메모에서 남겨진 표현을 붙여 넣거나 직접 요약합니다.",
  },
  {
    title: "페르소나 생성",
    body: "말투, 감정선, 자주 쓰는 문장을 기반으로 AI가 대화 성향을 구성합니다.",
  },
  {
    title: "동반자 채팅",
    body: "원하는 주제를 꺼내며 실제 대화를 이어가고 회복 기록을 쌓아갑니다.",
  },
];

const demoMessages = [
  { role: "ai", text: "오늘 하루는 어땠어? 너답게 천천히 말해도 돼." },
  {
    role: "user",
    text: "오랜만에 너랑 얘기하니까 조금 낯설면서도 편안해.",
  },
  { role: "ai", text: "그 감정 그대로 좋다. 우리 예전처럼 한 문장씩 나눠보자." },
];

function ChartIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor">
      <path d="M4 19h16" strokeWidth="1.8" />
      <rect x="6" y="10" width="3" height="6" rx="1" strokeWidth="1.8" />
      <rect x="11" y="7" width="3" height="9" rx="1" strokeWidth="1.8" />
      <rect x="16" y="4" width="3" height="12" rx="1" strokeWidth="1.8" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor">
      <path
        d="M4 19.5h5l10-10a1.8 1.8 0 0 0 0-2.6l-1.9-1.9a1.8 1.8 0 0 0-2.6 0l-10 10v4.5Z"
        strokeWidth="1.8"
      />
      <path d="m12.8 6.2 4.9 4.9" strokeWidth="1.8" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor">
      <path
        d="M20 14a4 4 0 0 1-4 4H9l-4 3v-3a4 4 0 0 1-1-2.7V8a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v6Z"
        strokeWidth="1.8"
      />
      <path d="M8 9h8M8 13h5" strokeWidth="1.8" />
    </svg>
  );
}

function isLikelyNativeAppUserAgent(userAgent: string) {
  const ua = userAgent.toLowerCase();
  return ua.includes("capacitor") || ua.includes("cordova") || ua.includes("co.kr.bogopa.app") || ua.includes("bogopanativeapp") || ua.includes("bogopa-native");
}

export default async function Home() {
  const requestHeaders = await headers();
  const userAgent = requestHeaders.get("user-agent") || "";
  const initialIsNativeApp = isLikelyNativeAppUserAgent(userAgent);

  const session = await getServerSession(authOptions);
  const sessionUser = session?.user as { id?: string; profileCompleted?: boolean } | undefined;

  if (initialIsNativeApp && !sessionUser?.id) {
    return <NativeAppLoginScreen />;
  }

  if (sessionUser?.id && sessionUser.profileCompleted !== true) {
    try {
      const profile = await getUserProfile(sessionUser.id);
      if (!profile.profileCompleted) {
        redirect("/signup?returnTo=%2Fstep-1");
      }
    } catch {
      redirect("/signup?returnTo=%2Fstep-1");
    }
  }

  const year = new Date().getFullYear();
  let liveReflections: ReflectionItem[] = [];

  try {
    const storedReviews = await listRecentUserReviews(HOME_REVIEW_QUERY_LIMIT);
    liveReflections = storedReviews.map((item) => ({
      name: item.nameMasked,
      text: item.reviewText,
    }));
  } catch (error) {
    console.error("[home] failed to load stored reviews", error);
  }

  const dedupeKeySet = new Set<string>();
  const mergedReflections = [...baseReflections, ...liveReflections].reduce<ReflectionItem[]>((acc, item) => {
    const name = item.name.trim();
    const text = item.text.trim();
    if (!name || !text) return acc;
    const key = `${name}__${text}`;
    if (dedupeKeySet.has(key)) return acc;
    dedupeKeySet.add(key);
    acc.push({ name, text });
    return acc;
  }, []).slice(0, HOME_REVIEW_RENDER_LIMIT);

  const reflectionRowTop = mergedReflections.filter((_, index) => index % 3 === 0);
  const reflectionRowMiddle = mergedReflections.filter((_, index) => index % 3 === 1);
  const reflectionRowBottom = mergedReflections.filter((_, index) => index % 3 === 2);

  return (
    <div className={`min-h-screen bg-[#faf9f5] ${initialIsNativeApp ? "native-home-static" : ""}`}>
      <WithdrawBlockedNoticeOverlay />
      <SignupCompleteModal />
      <Navigation />

      <HomeAppOnly initialIsNativeApp={initialIsNativeApp}>
        <header className="fixed left-0 top-0 z-20 w-full bg-[#242926] pt-[env(safe-area-inset-top)] lg:hidden">
          <div className="flex h-16 items-center justify-center">
            <div className="flex items-center gap-3">
              <img src="/logo/bogopa%20logo.png" alt="Logo" className="h-9 w-9 object-contain shadow-sm" />
              <span className="font-headline text-3xl font-extrabold tracking-tight text-[#4a626d]">Bogopa</span>
            </div>
          </div>
        </header>
      </HomeAppOnly>

      <main
        className={`home-main overflow-hidden pt-[max(env(safe-area-inset-top),3.5rem)] md:pt-14 lg:pt-20 lg:pl-64 ${
          initialIsNativeApp ? "pb-0 md:pb-0" : "pb-28 md:pb-20"
        }`}
      >
        <HomeWebOnly initialIsNativeApp={initialIsNativeApp}>
          <div className="lg:hidden">
            <RecallingLogo delay={800}>
              <div className="mb-10 flex flex-col items-center md:mb-16">
                <div className="flex items-center gap-3">
                  <img src="/logo/bogopa%20logo.png" alt="Logo" className="h-10 w-10 object-contain shadow-sm" />
                  <span className="font-headline text-3xl font-extrabold tracking-tight text-[#4a626d]">Bogopa</span>
                </div>
              </div>
            </RecallingLogo>
          </div>
        </HomeWebOnly>

        <section className="mx-auto w-full max-w-md px-3 text-center lg:max-w-6xl lg:px-6">
          <HomeAppOnly initialIsNativeApp={initialIsNativeApp}>
            <h1 className="font-headline mb-4 text-3xl font-extrabold leading-[1.1] tracking-tight text-[#2f342e] md:text-5xl">
              내 기억으로
              <br />
              <span className="text-[#4a626d]">시작되는 대화</span>
            </h1>
            <div className="flex flex-col items-center gap-3">
              <HomeMemoryCarouselClientOnly />
            </div>
          </HomeAppOnly>

          <HomeWebOnly initialIsNativeApp={initialIsNativeApp}>
            <TypewriterHeadline disableAnimation={initialIsNativeApp} />
            <FadeIn delay={1900} disableAnimation={initialIsNativeApp}>
              <p className="mx-auto mb-4 max-w-2xl break-keep text-lg leading-relaxed text-[#655d5a] md:mb-12 md:text-xl">
                대화 내용을 분석해, AI로 그 사람의 말투처럼 다시 대화할 수 있어요.
              </p>
              <div className="flex flex-col items-center gap-8">
                <div className="hidden flex-col gap-3 sm:flex-row md:flex">
                  <StartChatButtonDesktop />
                </div>
                <div
                  className="relative mt-0 w-full max-w-none overflow-hidden md:mt-8"
                  style={{
                    WebkitMaskImage:
                      "linear-gradient(to right, transparent 0%, black 8%, black 92%, transparent 100%)",
                    maskImage:
                      "linear-gradient(to right, transparent 0%, black 8%, black 92%, transparent 100%)",
                    WebkitMaskRepeat: "no-repeat",
                    maskRepeat: "no-repeat",
                    WebkitMaskSize: "100% 100%",
                    maskSize: "100% 100%",
                  }}
                >
                  <div className="space-y-3 py-4">
                    <div className="animate-marquee whitespace-nowrap">
                      {[...reflectionRowTop, ...reflectionRowTop].map((review, index) => (
                        <span
                          key={`top-${review.name}-${index}`}
                          className="mx-2 inline-flex items-center gap-2 rounded-full border border-[#afb3ac]/20 bg-white px-5 py-2 text-sm text-[#58504d] shadow-sm"
                        >
                          <strong className="font-semibold text-[#3e5560]">{review.name}</strong>
                          <span>“{review.text}”</span>
                        </span>
                      ))}
                    </div>

                    <div className="animate-marquee whitespace-nowrap">
                      {[...reflectionRowMiddle, ...reflectionRowMiddle].map((review, index) => (
                        <span
                          key={`middle-${review.name}-${index}`}
                          className="mx-2 inline-flex items-center gap-2 rounded-full border border-[#afb3ac]/20 bg-white px-5 py-2 text-sm text-[#58504d] shadow-sm"
                        >
                          <strong className="font-semibold text-[#3e5560]">{review.name}</strong>
                          <span>“{review.text}”</span>
                        </span>
                      ))}
                    </div>

                    <div className="animate-marquee whitespace-nowrap">
                      {[...reflectionRowBottom, ...reflectionRowBottom].map((review, index) => (
                        <span
                          key={`bottom-${review.name}-${index}`}
                          className="mx-2 inline-flex items-center gap-2 rounded-full border border-[#afb3ac]/20 bg-white px-5 py-2 text-sm text-[#58504d] shadow-sm"
                        >
                          <strong className="font-semibold text-[#3e5560]">{review.name}</strong>
                          <span>“{review.text}”</span>
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </FadeIn>
          </HomeWebOnly>
        </section>

        <HomeWebOnly initialIsNativeApp={initialIsNativeApp}>
          <FadeIn delay={1900}>
            <section className="mx-auto mt-24 max-w-6xl px-6">
              <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                {featureCards.map((feature) => (
                  <div
                    key={feature.title}
                    className={`rounded-2xl border p-8 text-center transition-transform duration-300 hover:-translate-y-1 ${feature.cardClassName}`}
                  >
                    <div
                      className={`mx-auto mb-6 grid h-14 w-14 place-items-center rounded-full ${feature.badgeClassName}`}
                    >
                      {feature.icon}
                    </div>
                    <h3 className="font-headline mb-3 text-xl font-bold text-[#2f342e]">{feature.title}</h3>
                    <p className="text-sm leading-relaxed text-[#655d5a]">{feature.description}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="mx-auto mt-20 grid max-w-6xl grid-cols-1 gap-8 px-6 lg:grid-cols-2">
              <article className="rounded-3xl border border-[#afb3ac]/30 bg-white p-8 shadow-[0_8px_24px_rgba(47,52,46,0.05)]">
                <h2 className="font-headline mb-6 text-2xl font-extrabold tracking-tight text-[#2f342e]">
                  대화 기반 페르소나 생성 플로우
                </h2>
                <div className="space-y-4">
                  {flowSteps.map((step, idx) => (
                    <div key={step.title} className="flex gap-4 rounded-2xl bg-[#f4f4ef] p-4">
                      <div className="font-headline mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#4a626d] text-sm font-bold text-[#f0f9ff]">
                        {idx + 1}
                      </div>
                      <div>
                        <h3 className="mb-1 font-semibold text-[#2f342e]">{step.title}</h3>
                        <p className="text-sm leading-relaxed text-[#655d5a]">{step.body}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </article>

              <article
                id="demo"
                className="rounded-3xl border border-[#afb3ac]/30 bg-[#2f342e] p-8 text-[#f0f9ff] shadow-[0_12px_30px_rgba(47,52,46,0.2)]"
              >
                <h2 className="font-headline mb-2 text-2xl font-extrabold tracking-tight">실제 대화 미리보기</h2>
                <p className="mb-6 text-sm leading-relaxed text-[#d6dcd2]">
                  생성된 페르소나는 말투, 공감 방식, 문장 길이까지 반영해 자연스럽게 응답합니다.
                </p>
                <div className="space-y-3">
                  {demoMessages.map((message, idx) => {
                    const isAi = message.role === "ai";
                    return (
                      <div
                        key={`${message.role}-${idx}`}
                        className={`max-w-[90%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${isAi
                          ? "bg-[#4a626d] text-[#f0f9ff]"
                          : "ml-auto bg-[#ece0dc] text-[#3e5560]"
                          }`}
                      >
                        {message.text}
                      </div>
                    );
                  })}
                </div>
              </article>
            </section>

            <section className="mx-auto mt-32 max-w-3xl px-6 text-center">
              <div className="mx-auto mb-10 h-px w-12 bg-[#afb3ac]/40" />
              <p className="font-body text-2xl leading-relaxed italic text-[#f0f5f2]">
                &quot;기억은 사라지는 것이 아니라,
                <br className="hidden md:block" />우리 마음 속 어딘가에서 잠시 대화를 멈춘 것뿐입니다.&quot;
              </p>
              <div className="mx-auto mt-10 h-px w-12 bg-[#afb3ac]/40" />
            </section>
          </FadeIn>
        </HomeWebOnly>
      </main>

      <FadeIn delay={1900}>
        <HomeWebOnly initialIsNativeApp={initialIsNativeApp}>
          <StartChatButtonMobile />
          <SiteFooter />
        </HomeWebOnly>
      </FadeIn>
    </div>
  );
}
