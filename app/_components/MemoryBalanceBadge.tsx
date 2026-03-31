"use client";

type MemoryBalanceBadgeProps = {
  memoryBalance: number | null;
  isAnimating?: boolean;
  showBorder?: boolean;
  className?: string;
};

function formatNumber(value: number) {
  return new Intl.NumberFormat("ko-KR").format(value);
}

function MemoryMarkIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeWidth="1.7">
      <circle cx="10" cy="10" r="7" />
      <path d="M10 6.4v4.2l2.7 1.8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="10" cy="10" r="0.8" fill="currentColor" stroke="none" />
    </svg>
  );
}

export default function MemoryBalanceBadge({
  memoryBalance,
  isAnimating = false,
  showBorder = true,
  className = "",
}: MemoryBalanceBadgeProps) {
  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-[#3e5560] transition-colors duration-200 ${
        isAnimating
          ? `bg-[#e8f1f5] ${showBorder ? "border border-[#3e5560]" : ""}`
          : `bg-[#f4f8fa] ${showBorder ? "border border-[#3e5560]" : ""}`
      } ${className}`}
    >
      <MemoryMarkIcon className="h-[18px] w-[18px] text-[#3e5560]" />
      <span className="text-[13px] font-medium leading-none">{memoryBalance === null ? "..." : formatNumber(memoryBalance)}</span>
    </div>
  );
}
