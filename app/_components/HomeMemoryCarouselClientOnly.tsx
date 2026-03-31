"use client";

import dynamic from "next/dynamic";

const HomeMemoryCarousel = dynamic(() => import("./HomeMemoryCarousel"), {
  ssr: false,
  loading: () => <div className="w-full min-h-[420px]" />,
});

export default function HomeMemoryCarouselClientOnly() {
  return <HomeMemoryCarousel />;
}

