"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { Capacitor } from "@capacitor/core";
import Navigation from "@/app/_components/Navigation";
import useNativeSwipeBack from "@/app/_components/useNativeSwipeBack";

type LetterItem = {
  id: string;
  persona_id: string;
  kind: "morning" | "evening";
  purpose: string;
  title: string;
  preview: string;
  content: string;
  is_read: boolean;
  created_at: string;
};

type PersonaItem = {
  persona_id: string;
  name: string;
  runtime?: {
    addressing?: {
      callsUserAs?: string[];
    };
  };
};

function ArrowLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.9">
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 12v5a2 2 0 002 2h6a2 2 0 002-2v-5" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v11m0-11l-4 4m4-4l4 4" />
    </svg>
  );
}

function drawRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const r = Math.min(radius, width * 0.5, height * 0.5);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function wrapTextByChar(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
) {
  const normalized = text.replace(/\r\n/g, "\n");
  const blocks = normalized.split("\n");
  const lines: string[] = [];

  for (const block of blocks) {
    let current = "";
    for (const ch of block) {
      const next = `${current}${ch}`;
      if (ctx.measureText(next).width <= maxWidth) {
        current = next;
        continue;
      }
      if (current) {
        lines.push(current.trimEnd());
      }
      current = ch;
      if (lines.length >= maxLines) break;
    }
    if (lines.length >= maxLines) break;
    if (current) lines.push(current.trimEnd());
    if (lines.length >= maxLines) break;
  }

  if (lines.length > maxLines) {
    return lines.slice(0, maxLines);
  }
  return lines;
}

async function renderLetterShareCard(input: {
  recipientLabel: string;
  dateLabel: string;
  kindText: string;
  content: string;
  personaName: string;
}) {
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1350;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("공유 이미지를 생성하지 못했습니다.");
  }

  // Background
  const bgGradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  bgGradient.addColorStop(0, "#f8fbff");
  bgGradient.addColorStop(1, "#eef4f7");
  ctx.fillStyle = bgGradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Main card
  drawRoundedRect(ctx, 70, 90, 940, 1160, 48);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.strokeStyle = "rgba(62,85,96,0.14)";
  ctx.lineWidth = 2;
  ctx.stroke();

  // Header
  ctx.fillStyle = "#4a626d";
  ctx.font = "700 34px 'Plus Jakarta Sans', 'Apple SD Gothic Neo', sans-serif";
  ctx.fillText("기억에서 온 편지", 130, 190);

  ctx.fillStyle = "rgba(74,98,109,0.86)";
  ctx.font = "600 24px 'Plus Jakarta Sans', 'Apple SD Gothic Neo', sans-serif";
  ctx.fillText(`${input.dateLabel} · ${input.kindText}`, 130, 238);

  ctx.fillStyle = "#2f342e";
  ctx.font = "700 48px 'Apple SD Gothic Neo', 'Noto Serif KR', serif";
  ctx.fillText(input.recipientLabel, 130, 320);

  // Body text
  const bodyStartY = 400;
  const bodyWidth = 820;
  ctx.fillStyle = "#2f342e";
  ctx.font = "500 34px 'Apple SD Gothic Neo', 'Noto Serif KR', serif";
  const contentLines = wrapTextByChar(ctx, input.content, bodyWidth, 16);
  const lineHeight = 55;
  contentLines.forEach((line, index) => {
    ctx.fillText(line, 130, bodyStartY + lineHeight * index);
  });

  // Footer
  const footerY = 1140;
  ctx.fillStyle = "#4a626d";
  ctx.font = "600 28px 'Apple SD Gothic Neo', 'Noto Serif KR', serif";
  ctx.fillText(`진심을 담아, ${input.personaName}`, 130, footerY);

  ctx.fillStyle = "rgba(62,85,96,0.9)";
  ctx.font = "800 30px 'Plus Jakarta Sans', 'Apple SD Gothic Neo', sans-serif";
  ctx.fillText("Bogopa", 130, 1210);

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("공유 이미지를 생성하지 못했습니다."));
        return;
      }
      resolve(blob);
    }, "image/png");
  });
}

async function blobToBase64(blob: Blob) {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("이미지 인코딩에 실패했습니다."));
    reader.readAsDataURL(blob);
  });
  return dataUrl.replace(/^data:.*;base64,/, "");
}

async function fallbackWebShare(file: File, text: string, blob: Blob) {
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    const canShareFiles =
      typeof navigator.canShare === "function" ? navigator.canShare({ files: [file] }) : false;
    if (canShareFiles) {
      await navigator.share({
        title: "기억에서 온 편지",
        text,
        files: [file],
      });
      return;
    }
    await navigator.share({
      title: "기억에서 온 편지",
      text,
      url: window.location.href,
    });
    return;
  }

  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = file.name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}

function formatLetterDate(createdAt: string) {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return "";
  const weekday = new Intl.DateTimeFormat("ko-KR", { weekday: "long", timeZone: "Asia/Seoul" }).format(date);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return `${month}월 ${day}일 ${weekday}`;
}

function kindLabel(kind: "morning" | "evening") {
  return kind === "morning" ? "아침 편지" : "밤 편지";
}

function normalizeRecipientAlias(value: string) {
  const cleaned = value
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[~!?.…]+$/g, "")
    .replace(/^["'“”‘’\s]+|["'“”‘’\s]+$/g, "");
  if (!cleaned) return "";

  let base = cleaned;
  if (base.length > 1 && /(야|아)$/.test(base)) {
    const stripped = base.slice(0, -1).trim();
    if (stripped && !/[야아]$/.test(stripped)) {
      base = stripped;
    }
  }

  const compact = base.replace(/\s+/g, "");
  if (!compact) return "";
  if (/^(울|우리)\s*/.test(base)) return base;

  if (
    compact === "자기" ||
    compact === "여보" ||
    compact === "애기" ||
    compact === "아가" ||
    compact === "내사랑" ||
    compact === "사랑" ||
    compact === "베이비"
  ) {
    return `울 ${base}`;
  }

  return base;
}

function buildLetterRecipient(alias: string) {
  const normalized = normalizeRecipientAlias(alias);
  return `${normalized || "너"}에게`;
}

function LetterReadContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const letterId = searchParams.get("id")?.trim() || "";
  const [letter, setLetter] = useState<LetterItem | null>(null);
  const [personaName, setPersonaName] = useState("기억");
  const [personaAlias, setPersonaAlias] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [isSharing, setIsSharing] = useState(false);
  const [shareError, setShareError] = useState("");

  useNativeSwipeBack(
    () => {
      if (window.history.length > 1) {
        router.back();
        return;
      }
      router.push("/letters/inbox");
    },
    { startMode: "content" },
  );

  useEffect(() => {
    if (!letterId) {
      setIsLoading(false);
      setError("편지 정보를 찾을 수 없습니다.");
      return;
    }

    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch(`/api/letters?id=${encodeURIComponent(letterId)}&markRead=1`, { cache: "no-store" });
        const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; letter?: LetterItem; error?: string };
        if (!response.ok || !payload.ok || !payload.letter) {
          throw new Error(payload.error || "편지를 불러오지 못했습니다.");
        }
        if (cancelled) return;
        setLetter(payload.letter);

        const personaRes = await fetch("/api/persona", { cache: "no-store" });
        if (personaRes.ok) {
          const personaPayload = (await personaRes.json()) as { ok?: boolean; personas?: PersonaItem[] };
          const selected = personaPayload.personas?.find((item) => item.persona_id === payload.letter!.persona_id);
          if (!cancelled && selected?.name) {
            setPersonaName(selected.name);
          }
          if (!cancelled) {
            const alias = selected?.runtime?.addressing?.callsUserAs?.[0];
            setPersonaAlias(typeof alias === "string" ? alias : "");
          }
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "편지를 불러오는 중 오류가 발생했습니다.");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [letterId]);

  const dateLabel = useMemo(() => (letter ? formatLetterDate(letter.created_at) : ""), [letter]);
  const kindText = letter ? kindLabel(letter.kind) : "편지";
  const recipientLabel = useMemo(() => buildLetterRecipient(personaAlias), [personaAlias]);

  const handleShare = async () => {
    if (!letter || isSharing) return;
    setIsSharing(true);
    setShareError("");
    try {
      const blob = await renderLetterShareCard({
        recipientLabel,
        dateLabel,
        kindText,
        content: letter.content,
        personaName,
      });
      const fileName = `bogopa-letter-${letter.id.slice(0, 8)}.png`;
      const file = new File([blob], fileName, { type: "image/png" });
      const shareText = `${recipientLabel}\n${dateLabel} · ${kindText}`;

      if (Capacitor.isNativePlatform()) {
        const [{ Share }, { Filesystem, Directory }] = await Promise.all([
          import("@capacitor/share"),
          import("@capacitor/filesystem"),
        ]);
        const base64 = await blobToBase64(blob);
        const path = `bogopa-share/${fileName}`;
        await Filesystem.writeFile({
          path,
          data: base64,
          directory: Directory.Cache,
          recursive: true,
        });
        const uri = await Filesystem.getUri({ path, directory: Directory.Cache });
        await Share.share({
          title: "기억에서 온 편지",
          text: shareText,
          url: uri.uri,
          dialogTitle: "편지 공유하기",
        });
      } else {
        await fallbackWebShare(file, shareText, blob);
      }
    } catch (shareLoadError) {
      const message = shareLoadError instanceof Error ? shareLoadError.message : "공유에 실패했습니다.";
      setShareError(message);
    } finally {
      setIsSharing(false);
    }
  };

  return (
    <div className="letter-page-bg min-h-screen text-[#2f342e]">
      <Navigation hideMobileBottomNav />

      <header className="fixed top-0 z-50 w-full border-b border-[#d6ddd8] bg-[#ffffff]/95 pt-[env(safe-area-inset-top)] backdrop-blur-md lg:pl-64">
        <div className="mx-auto flex h-16 w-full items-center justify-between px-4">
          <Link href="/letters/inbox" className="rounded-xl p-2 text-[#2f342e] transition-colors hover:bg-black/5" aria-label="뒤로가기">
            <ArrowLeftIcon />
          </Link>
          <span className="font-headline text-lg font-bold tracking-tight text-[#2f342e]">기억에서 온 편지</span>
          <span aria-hidden="true" className="h-9 w-9" />
        </div>
      </header>

      <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col items-center px-6 pb-32 pt-[calc(5.8rem+env(safe-area-inset-top))]">
        {isLoading ? (
          <div className="mt-20 h-10 w-10 animate-spin rounded-full border-4 border-[#4a626d] border-t-transparent" />
        ) : error ? (
          <article className="mt-12 w-full rounded-3xl border border-[#d6ddd8] bg-[#ffffff] p-6 text-center">
            <p className="text-sm text-[#ffb4ab]">{error}</p>
            <Link
              href="/letters/inbox"
              className="mt-4 inline-flex rounded-2xl bg-[#4a626d] px-4 py-2.5 text-sm font-bold text-[#f0f9ff]"
            >
              보관함으로 돌아가기
            </Link>
          </article>
        ) : letter ? (
          <article className="w-full">
            <div className="mb-10 -rotate-1">
              <p className="font-headline text-sm font-semibold tracking-widest text-[#4a626d]">{dateLabel} · {kindText}</p>
              <h1 className="font-headline mt-1 text-2xl font-bold text-[#2f342e]">{recipientLabel}</h1>
            </div>

            <section className="px-1 py-1 md:px-0 md:py-0">
              <div className="letter-writing serif-kr whitespace-pre-wrap tracking-[0.01em] text-[#2f342e]">
                {letter.content}
              </div>
              <p className="serif-kr mt-10 text-right text-[0.98rem] text-[#4a626d]">진심을 담아, {personaName}</p>
            </section>

            <div className="mt-12 flex justify-center opacity-80">
              <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-[#4a626d]/55">
                <span className="font-headline text-[10px] font-bold uppercase leading-tight tracking-tight text-[#4a626d]">
                  Bogopa
                  <br />
                  Letter
                </span>
              </div>
            </div>
          </article>
        ) : null}
        {shareError ? <p className="mt-4 text-sm text-[#b42318]">{shareError}</p> : null}
      </main>

      {!isLoading && !error && letter ? (
        <button
          type="button"
          onClick={handleShare}
          disabled={isSharing}
          className="fixed bottom-[calc(1.25rem+env(safe-area-inset-bottom))] right-5 z-[70] inline-flex h-14 w-14 items-center justify-center rounded-full bg-[#4a626d] text-white shadow-lg transition-transform active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
          aria-label="편지 공유하기"
        >
          <ShareIcon />
        </button>
      ) : null}

      <style jsx>{`
        .serif-kr {
          font-family: "Noto Serif KR", serif;
        }
        .letter-page-bg {
          background-color: #ffffff;
          background-image:
            radial-gradient(rgba(74, 98, 109, 0.055) 0.65px, transparent 0.65px),
            radial-gradient(rgba(47, 52, 46, 0.04) 0.8px, transparent 0.8px);
          background-size: 3px 3px, 5px 5px;
          background-position: 0 0, 1px 2px;
        }
        .letter-writing {
          --font-size: 17px;
          --line-step: 34px;
          font-size: var(--font-size);
          line-height: var(--line-step);
        }
        @media (min-width: 768px) {
          .letter-writing {
            --font-size: 18px;
            --line-step: 36px;
          }
        }
      `}</style>
    </div>
  );
}

export default function LettersReadPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#ffffff]" />}>
      <LetterReadContent />
    </Suspense>
  );
}
