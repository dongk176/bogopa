import type { Metadata } from "next";
import { Manrope, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import AuthProvider from "@/app/_components/AuthProvider";
import StepRouteScrollTop from "@/app/_components/StepRouteScrollTop";

const headlineFont = Manrope({
  subsets: ["latin"],
  weight: ["400", "700", "800"],
  variable: "--font-headline",
});

const bodyFont = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-body",
});

export const metadata: Metadata = {
  title: "보고파 | AI 대화 동반자",
  description:
    "대화 기록을 바탕으로 페르소나를 만들고, 실제 대화를 이어갈 수 있는 AI 대화 동반자 서비스",
  icons: {
    icon: "/logo/bogopa%20logo.png",
  },
};

const rootClassName = `${headlineFont.variable} ${bodyFont.variable} h-full antialiased`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className={rootClassName}>
      <head>
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" />
      </head>
      <body className="min-h-full flex flex-col bg-[#faf9f5] text-[#2f342e]">
        <AuthProvider>
          <StepRouteScrollTop />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
