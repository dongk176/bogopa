"use client";

import { useState } from "react";
import Link from "next/link";

export default function SiteFooter() {
    const [open, setOpen] = useState(false);
    const year = new Date().getFullYear();

    return (
        <footer className="w-full bg-[#faf9f5] px-6 py-12 pb-[calc(11rem+env(safe-area-inset-bottom))] md:py-16 md:pb-16">
            <div className="mx-auto max-w-7xl">
                <div className="flex flex-col items-center justify-between md:flex-row md:items-end">
                    <div className="text-center md:text-left">
                        <span className="font-headline mb-3 flex items-center justify-center gap-2 text-2xl font-extrabold tracking-tight text-[#4a626d] md:justify-start">
                            Bogopa
                        </span>
                        <p className="text-sm leading-relaxed text-[#655d5a]">
                            기억을 바탕으로,
                            <br />
                            다시 만나는 대화 동반자
                        </p>
                    </div>

                    <div className="mt-6 md:mt-0">
                        <button
                            type="button"
                            onClick={() => setOpen((v) => !v)}
                            className="inline-flex items-center gap-1.5 text-sm font-medium text-[#655d5a] hover:text-[#4a626d]"
                            aria-expanded={open}
                        >
                            <span>{open ? '접기' : '정보 더보기'}</span>
                            <span
                                className={`inline-flex transition-transform duration-200 ${open ? 'rotate-180' : 'rotate-0'
                                    }`}
                                aria-hidden="true"
                            >
                                <svg width="14" height="14" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                            </span>
                        </button>
                    </div>
                </div>

                <div className={`transition-all duration-300 overflow-hidden ${open ? 'mt-10 max-h-[1000px] opacity-100' : 'max-h-0 opacity-0'}`}>
                    <div className="grid grid-cols-1 gap-10 text-center text-sm text-[#655d5a] md:grid-cols-3 md:text-left">
                        <div className="space-y-3">
                            <h3 className="mb-4 font-headline text-base font-bold text-[#4a626d]">안내</h3>
                            <ul className="space-y-2.5">
                                <li><Link href="/legal/terms" className="transition-colors hover:text-[#4a626d] hover:underline">서비스 이용약관</Link></li>
                                <li><Link href="/legal/privacy" className="transition-colors hover:text-[#4a626d] hover:underline">개인정보 수집·이용 동의</Link></li>
                                <li><a href="https://www.instagram.com/bogopa.official/?utm_source=ig_web_button_share_sheet" target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-[#4a626d] hover:underline">인스타그램</a></li>
                            </ul>
                        </div>

                        <div className="space-y-3">
                            <h3 className="mb-4 font-headline text-base font-bold text-[#4a626d]">고객센터</h3>
                            <ul className="space-y-2.5">
                                <li>운영시간: 평일 14:00 ~ 19:00</li>
                                <li>전화: <a href="tel:01036032874" className="hover:underline">010-3603-2874</a></li>
                                <li>이메일: <a href="mailto:artiroom176@gmail.com" className="hover:underline">artiroom176@gmail.com</a></li>
                            </ul>
                        </div>

                        <div className="space-y-3">
                            <h3 className="mb-4 font-headline text-base font-bold text-[#4a626d]">사업자 정보</h3>
                            <ul className="space-y-2.5">
                                <li className="text-[13px]">상호: 아티룸 | 대표: 김동민</li>
                                <li className="text-[13px]">사업자등록번호: 638-04-03590</li>
                                <li className="text-[13px]">통신판매업 신고번호: 2025-서울마포-2971</li>
                                <li className="text-[13px]">주소: 서울특별시 마포구 성산로8길 40</li>
                            </ul>
                        </div>
                    </div>
                </div>

                <div className="mt-12 border-t border-[#dfdfd8] pt-8 text-center text-xs text-[#655d5a] md:flex md:items-center md:justify-between md:text-left">
                    <p>Copyright © {year} Artiroom. All Rights Reserved.</p>
                    <p className="mt-2 md:mt-0">보고파는 아티룸에서 운영합니다.</p>
                </div>
            </div>
        </footer>
    );
}
