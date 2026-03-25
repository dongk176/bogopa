"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { FormEvent, useEffect, useRef, useState } from "react";
import Navigation from "@/app/_components/Navigation";

type HolderType = "personal" | "corporate";

type PaymentCard = {
  id: string;
  cardAlias: string;
  cardBrand: string;
  cardMaskedNumber: string;
  holderType: HolderType;
  expiryMonth: number;
  expiryYear: number;
  isDefault: boolean;
  createdAt: string;
};

type PaymentCardResponse = {
  ok?: boolean;
  cards?: PaymentCard[];
  error?: string;
};

function ArrowLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M19 12H5" />
      <path d="m11 6-6 6 6 6" />
    </svg>
  );
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function formatExpiry(month: number, year: number) {
  return `${String(month).padStart(2, "0")}/${String(year).slice(-2)}`;
}

function formatCardInput(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 19);
  return digits.match(/.{1,4}/g)?.join(" ") || "";
}

function formatExpiryInput(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

export default function BillingPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [cards, setCards] = useState<PaymentCard[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<PaymentCard | null>(null);
  const [isHolderTypeOpen, setIsHolderTypeOpen] = useState(false);
  const holderTypeRef = useRef<HTMLDivElement | null>(null);
  const [form, setForm] = useState({
    cardNumber: "",
    cardPassword2: "",
    expiry: "",
    holderType: "personal" as HolderType,
    birthDate: "",
    cardAlias: "",
    setAsDefault: true,
  });

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/");
    }
  }, [status, router]);

  useEffect(() => {
    if (status !== "authenticated") return;
    let cancelled = false;

    const loadCards = async () => {
      try {
        const response = await fetch("/api/payment-cards", { cache: "no-store" });
        const payload = (await response.json()) as PaymentCardResponse;
        if (cancelled) return;
        if (!response.ok) {
          setError(payload.error || "결제정보를 불러오지 못했습니다.");
          setCards([]);
          return;
        }
        setCards(payload.cards || []);
      } catch {
        if (!cancelled) {
          setError("결제정보를 불러오지 못했습니다.");
          setCards([]);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void loadCards();
    return () => {
      cancelled = true;
    };
  }, [status]);

  useEffect(() => {
    if (!isHolderTypeOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!holderTypeRef.current) return;
      if (holderTypeRef.current.contains(event.target as Node)) return;
      setIsHolderTypeOpen(false);
    };
    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [isHolderTypeOpen]);

  async function refreshCards() {
    const response = await fetch("/api/payment-cards", { cache: "no-store" });
    const payload = (await response.json()) as PaymentCardResponse;
    if (!response.ok) {
      throw new Error(payload.error || "결제정보를 불러오지 못했습니다.");
    }
    setCards(payload.cards || []);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    setIsSaving(true);
    try {
      const response = await fetch("/api/payment-cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const payload = (await response.json()) as PaymentCardResponse;
      if (!response.ok) {
        throw new Error(payload.error || "카드 등록에 실패했습니다.");
      }
      setCards(payload.cards || []);
      setForm({
        cardNumber: "",
        cardPassword2: "",
        expiry: "",
        holderType: "personal",
        birthDate: "",
        cardAlias: "",
        setAsDefault: false,
      });
      setSuccess("카드가 안전하게 등록되었습니다.");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "카드 등록에 실패했습니다.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(cardId: string) {
    setError("");
    setSuccess("");
    try {
      const response = await fetch(`/api/payment-cards?cardId=${encodeURIComponent(cardId)}`, {
        method: "DELETE",
      });
      const payload = (await response.json()) as PaymentCardResponse;
      if (!response.ok) {
        throw new Error(payload.error || "카드 삭제에 실패했습니다.");
      }
      setCards(payload.cards || []);
      setSuccess("카드를 삭제했습니다.");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "카드 삭제에 실패했습니다.");
    }
  }

  async function handleSetDefault(cardId: string) {
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/payment-cards", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set_default", cardId }),
      });
      const payload = (await response.json()) as PaymentCardResponse;
      if (!response.ok) {
        throw new Error(payload.error || "기본카드 설정에 실패했습니다.");
      }
      setCards(payload.cards || []);
      setSuccess("기본카드가 변경되었습니다.");
    } catch (setDefaultError) {
      setError(setDefaultError instanceof Error ? setDefaultError.message : "기본카드 설정에 실패했습니다.");
    }
  }

  if (status === "loading" || isLoading) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#242926]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#7fa4b6] border-t-transparent" />
      </div>
    );
  }

  if (!session) return null;

  return (
    <div className="min-h-screen bg-[#242926] text-[#f0f5f2]">
      <Navigation />

      <nav className="fixed top-0 left-0 z-30 w-full border-b border-white/5 bg-[#242926]/90 backdrop-blur-md">
        <div className="relative mx-auto flex h-16 w-full items-center px-3 md:px-4 lg:px-10">
          <Link
            href="/profile"
            className="inline-flex items-center justify-center rounded-xl p-2 text-[#afb3ac] transition-colors hover:bg-white/5 hover:text-[#f0f9ff]"
            aria-label="뒤로가기"
          >
            <ArrowLeftIcon />
          </Link>
          <h1 className="pointer-events-none absolute left-1/2 -translate-x-1/2 font-headline text-lg font-bold tracking-tight text-[#f0f9ff]">
            결제 카드
          </h1>
        </div>
      </nav>

      <main className="lg:pl-64">
        <div className="mx-auto w-full max-w-4xl px-6 pb-[calc(8rem+env(safe-area-inset-bottom))] pt-24 lg:pt-24">
          <header className="sr-only">
            <Link
              href="/profile"
              className="inline-flex items-center justify-center rounded-xl p-2 text-[#6b746f] transition-colors hover:bg-black/5 hover:text-[#2f342e]"
              aria-label="Back to profile"
            >
              <ArrowLeftIcon />
            </Link>
            <div>
              <h1 className="font-headline text-3xl font-extrabold tracking-tight text-[#2f342e]">결제 카드</h1>
            </div>
          </header>

          <section className="rounded-[2rem] border border-white/10 bg-[#303733] p-6 shadow-[0_12px_30px_rgba(0,0,0,0.28)] md:p-8">
            <form onSubmit={handleSubmit} autoComplete="off" className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <label className="space-y-2 md:col-span-2">
                <span className="text-sm font-bold text-[#d9e1da]">카드 번호</span>
                <input
                  value={form.cardNumber}
                  onChange={(e) => setForm((prev) => ({ ...prev, cardNumber: formatCardInput(e.target.value) }))}
                  inputMode="numeric"
                  autoComplete="off"
                  name="card_number_manual"
                  placeholder="0000 0000 0000 0000"
                  className="w-full rounded-2xl border border-white/10 bg-[#242926] px-4 py-3 text-[#f0f5f2] outline-none transition placeholder:text-[#6f7a74] focus:border-[#7fa4b6] focus:bg-[#2b322f]"
                />
              </label>

              <label className="space-y-2">
                <span className="text-sm font-bold text-[#d9e1da]">비밀번호 앞 두자리</span>
                <input
                  value={form.cardPassword2}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, cardPassword2: e.target.value.replace(/\D/g, "").slice(0, 2) }))
                  }
                  inputMode="numeric"
                  autoComplete="off"
                  type="password"
                  placeholder="**"
                  className="w-full rounded-2xl border border-white/10 bg-[#242926] px-4 py-3 text-[#f0f5f2] outline-none transition placeholder:text-[#6f7a74] focus:border-[#7fa4b6] focus:bg-[#2b322f]"
                />
              </label>

              <label className="space-y-2">
                <span className="text-sm font-bold text-[#d9e1da]">유효기간</span>
                <input
                  value={form.expiry}
                  onChange={(e) => setForm((prev) => ({ ...prev, expiry: formatExpiryInput(e.target.value) }))}
                  inputMode="numeric"
                  autoComplete="off"
                  name="card_expiry_manual"
                  placeholder="MM/YY"
                  className="w-full rounded-2xl border border-white/10 bg-[#242926] px-4 py-3 text-[#f0f5f2] outline-none transition placeholder:text-[#6f7a74] focus:border-[#7fa4b6] focus:bg-[#2b322f]"
                />
              </label>

              <label className="space-y-2">
                <span className="text-sm font-bold text-[#d9e1da]">카드 구분</span>
                <div ref={holderTypeRef} className="relative">
                  <button
                    type="button"
                    onClick={() => setIsHolderTypeOpen((prev) => !prev)}
                    className="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-[#242926] px-4 py-3 text-[#f0f5f2] outline-none transition hover:bg-[#2b322f]"
                    aria-haspopup="listbox"
                    aria-expanded={isHolderTypeOpen}
                  >
                    <span>{form.holderType === "personal" ? "개인" : "기업"}</span>
                    <ChevronDownIcon className={`h-4 w-4 text-[#b8c7bf] transition-transform ${isHolderTypeOpen ? "rotate-180" : "rotate-0"}`} />
                  </button>

                  {isHolderTypeOpen ? (
                    <div className="absolute bottom-full left-0 right-0 z-30 mb-2 overflow-hidden rounded-2xl border border-white/10 bg-[#2b322f] shadow-2xl shadow-black/30">
                      <button
                        type="button"
                        onClick={() => {
                          setForm((prev) => ({ ...prev, holderType: "personal" }));
                          setIsHolderTypeOpen(false);
                        }}
                        className={`block w-full px-4 py-3 text-left text-sm font-bold transition-colors ${
                          form.holderType === "personal"
                            ? "bg-[#4a626d] text-[#f0f9ff]"
                            : "text-[#d9e1da] hover:bg-white/5"
                        }`}
                        role="option"
                        aria-selected={form.holderType === "personal"}
                      >
                        개인
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setForm((prev) => ({ ...prev, holderType: "corporate" }));
                          setIsHolderTypeOpen(false);
                        }}
                        className={`block w-full px-4 py-3 text-left text-sm font-bold transition-colors ${
                          form.holderType === "corporate"
                            ? "bg-[#4a626d] text-[#f0f9ff]"
                            : "text-[#d9e1da] hover:bg-white/5"
                        }`}
                        role="option"
                        aria-selected={form.holderType === "corporate"}
                      >
                        기업
                      </button>
                    </div>
                  ) : null}
                </div>
              </label>

              <label className="space-y-2">
                <span className="text-sm font-bold text-[#d9e1da]">생년월일</span>
                <input
                  value={form.birthDate}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, birthDate: e.target.value.replace(/\D/g, "").slice(0, 6) }))
                  }
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="6자리 (YYMMDD)"
                  className="w-full rounded-2xl border border-white/10 bg-[#242926] px-4 py-3 text-[#f0f5f2] outline-none transition placeholder:text-[#6f7a74] focus:border-[#7fa4b6] focus:bg-[#2b322f]"
                />
              </label>

              <label className="space-y-2 md:col-span-2">
                <span className="text-sm font-bold text-[#d9e1da]">카드 별명</span>
                <input
                  value={form.cardAlias}
                  onChange={(e) => setForm((prev) => ({ ...prev, cardAlias: e.target.value.slice(0, 40) }))}
                  placeholder="예: 주 결제카드"
                  className="w-full rounded-2xl border border-white/10 bg-[#242926] px-4 py-3 text-[#f0f5f2] outline-none transition placeholder:text-[#6f7a74] focus:border-[#7fa4b6] focus:bg-[#2b322f]"
                />
              </label>

              <label className="mt-1 inline-flex items-center gap-2 md:col-span-2">
                <input
                  type="checkbox"
                  checked={form.setAsDefault}
                  onChange={(e) => setForm((prev) => ({ ...prev, setAsDefault: e.target.checked }))}
                  className="h-4 w-4 rounded border-white/20 bg-[#242926]"
                />
                <span className="text-sm text-[#c7d2cc]">기본 결제카드로 설정</span>
              </label>

              {error ? <p className="text-sm font-semibold text-[#9f403d] md:col-span-2">{error}</p> : null}
              {success ? <p className="text-sm font-semibold text-[#2d7b52] md:col-span-2">{success}</p> : null}

              <div className="md:col-span-2">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="inline-flex items-center justify-center rounded-2xl bg-[#4a626d] px-6 py-3 text-sm font-extrabold text-[#f0f9ff] shadow-lg shadow-black/20 transition-all hover:scale-[1.02] hover:bg-[#3e5661] active:scale-95 disabled:opacity-60"
                >
                  {isSaving ? "등록 중..." : "카드 등록하기"}
                </button>
              </div>
            </form>

          </section>

          <section className="mt-8 rounded-[2rem] border border-white/10 bg-[#303733] p-6 shadow-[0_12px_30px_rgba(0,0,0,0.28)] md:p-8">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-headline text-xl font-bold text-[#f0f5f2]">저장된 카드</h2>
              <button
                type="button"
                onClick={() => void refreshCards().catch((refreshError) => setError(refreshError.message))}
                className="rounded-xl border border-white/20 px-3 py-1.5 text-xs font-bold text-[#d9e1da] hover:bg-white/5"
              >
                새로고침
              </button>
            </div>

            {cards.length === 0 ? (
              <p className="rounded-2xl bg-[#242926] px-4 py-4 text-sm text-[#a0aaa4]">등록된 결제카드가 없습니다.</p>
            ) : (
              <div className="space-y-3">
                {cards.map((card) => (
                  <div key={card.id} className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-[#242926] p-4 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-sm font-extrabold text-[#f0f5f2]">
                        {card.cardAlias} {card.isDefault ? <span className="ml-2 rounded-full bg-[#4a626d] px-2 py-0.5 text-[10px] text-white">기본</span> : null}
                      </p>
                      <p className="mt-1 text-sm text-[#b9c4be]">
                        {card.cardBrand} · {card.cardMaskedNumber} · {card.holderType === "corporate" ? "기업" : "개인"} ·
                        {" "}만료 {formatExpiry(card.expiryMonth, card.expiryYear)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {!card.isDefault ? (
                        <button
                          type="button"
                          onClick={() => void handleSetDefault(card.id)}
                          className="rounded-xl border border-white/20 px-3 py-2 text-xs font-bold text-[#d9e1da] hover:bg-white/5"
                        >
                          기본카드 설정
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(card)}
                        className="rounded-xl border border-[#e2b9b7]/45 px-3 py-2 text-xs font-bold text-[#f0b6b4] hover:bg-[#9f403d]/10"
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>

      {deleteTarget ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 px-5 backdrop-blur-sm">
          <section
            className="w-full max-w-sm rounded-[2rem] border border-white/10 bg-[#303733] p-6 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className="font-headline text-xl font-bold text-[#f0f5f2]">카드 삭제</h3>
            <p className="mt-3 text-sm leading-relaxed text-[#c7d2cc]">
              {deleteTarget.cardAlias} 카드를 삭제할까요?
              <br />
              삭제하면 복구할 수 없습니다.
            </p>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="rounded-2xl border border-white/15 py-3 text-sm font-bold text-[#d9e1da] hover:bg-white/5"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => {
                  const targetId = deleteTarget.id;
                  setDeleteTarget(null);
                  void handleDelete(targetId);
                }}
                className="rounded-2xl bg-[#9f403d] py-3 text-sm font-bold text-white shadow-lg shadow-black/20 hover:bg-[#8c3431]"
              >
                삭제하기
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
