"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { MEMORY_COSTS } from "@/lib/memory-pass/config";

type GuardModalState = {
  title: string;
  description: string;
  ctaLabel?: string;
  returnTo?: string;
};

type GuardOptions = {
  returnTo: string;
  onAllowed: () => void;
};

type MemoryPassPayload = {
  ok?: boolean;
  isSubscribed?: boolean;
  memoryBalance?: number;
  limits?: {
    maxPersonas?: number;
  };
};

type PersonaPayload = {
  ok?: boolean;
  personas?: Array<{ persona_id?: string }>;
};

export default function useMemoryCreateGuard() {
  const router = useRouter();
  const [isChecking, setIsChecking] = useState(false);
  const [modal, setModal] = useState<GuardModalState | null>(null);

  useEffect(() => {
    if (!modal || typeof window === "undefined") return;

    const body = document.body;
    const html = document.documentElement;
    const scrollY = window.scrollY;

    const prevBodyOverflow = body.style.overflow;
    const prevBodyPosition = body.style.position;
    const prevBodyTop = body.style.top;
    const prevBodyWidth = body.style.width;
    const prevBodyLeft = body.style.left;
    const prevBodyRight = body.style.right;

    const prevHtmlOverflow = html.style.overflow;
    const prevHtmlOverscrollBehavior = html.style.overscrollBehavior;

    body.style.overflow = "hidden";
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.width = "100%";
    body.style.left = "0";
    body.style.right = "0";

    html.style.overflow = "hidden";
    html.style.overscrollBehavior = "none";

    return () => {
      body.style.overflow = prevBodyOverflow;
      body.style.position = prevBodyPosition;
      body.style.top = prevBodyTop;
      body.style.width = prevBodyWidth;
      body.style.left = prevBodyLeft;
      body.style.right = prevBodyRight;

      html.style.overflow = prevHtmlOverflow;
      html.style.overscrollBehavior = prevHtmlOverscrollBehavior;

      window.scrollTo(0, scrollY);
    };
  }, [modal]);

  const closeModal = () => setModal(null);

  const openPayment = () => {
    if (!modal?.returnTo) {
      router.push("/payment");
      return;
    }
    router.push(`/payment?returnTo=${encodeURIComponent(modal.returnTo)}`);
  };

  const guardCreateStart = async ({ returnTo, onAllowed }: GuardOptions) => {
    if (isChecking) return;
    setIsChecking(true);
    try {
      const [memoryRes, personaRes] = await Promise.all([
        fetch("/api/memory-pass", { cache: "no-store" }),
        fetch("/api/persona", { cache: "no-store" }),
      ]);

      if (!memoryRes.ok || !personaRes.ok) {
        onAllowed();
        return;
      }

      const memory = (await memoryRes.json()) as MemoryPassPayload;
      const persona = (await personaRes.json()) as PersonaPayload;

      const isSubscribed = Boolean(memory.isSubscribed);
      const balance = Number(memory.memoryBalance ?? 0);
      const maxPersonas = Number(memory.limits?.maxPersonas ?? 1);
      const personaCount = Array.isArray(persona.personas) ? persona.personas.length : 0;

      if (!isSubscribed && personaCount >= maxPersonas) {
        setModal({
          title: "기억 패스가 필요합니다.",
          description: "기억 패스 등록하고 최대 15명의 기억을 추가해 보세요.",
          ctaLabel: "기억 패스 등록하기",
          returnTo,
        });
        return;
      }

      if (balance < MEMORY_COSTS.personaCreate) {
        setModal({
          title: "기억을 충전해주세요.",
          description: `새 기억 생성에는 ${MEMORY_COSTS.personaCreate}기억이 필요합니다.`,
          ctaLabel: "기억 충전하러 가기",
          returnTo,
        });
        return;
      }

      onAllowed();
    } catch {
      onAllowed();
    } finally {
      setIsChecking(false);
    }
  };

  const modalNode = modal ? (
    <div className="fixed inset-0 z-[140] flex items-center justify-center px-5">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={closeModal} />
      <section className="relative w-full max-w-sm rounded-[2rem] border border-white/10 bg-[#303733] p-7 shadow-2xl">
        <h3 className="font-headline text-xl font-bold text-[#f0f5f2]">{modal.title}</h3>
        <p className="mt-3 text-sm font-semibold leading-relaxed text-[#e8f1ec]">{modal.description}</p>
        <div className="mt-6 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={closeModal}
            className="rounded-xl border border-white/15 px-4 py-3 text-sm font-bold text-[#f0f5f2] hover:bg-white/5"
          >
            취소
          </button>
          <button
            type="button"
            onClick={openPayment}
            className="rounded-xl bg-[#4a626d] px-4 py-3 text-sm font-extrabold text-[#f0f9ff] hover:bg-[#3e5661]"
          >
            {modal.ctaLabel || "결제 페이지로 이동"}
          </button>
        </div>
      </section>
    </div>
  ) : null;

  return {
    isChecking,
    guardCreateStart,
    modalNode,
  };
}
