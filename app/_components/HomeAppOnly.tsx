"use client";

import { Capacitor } from "@capacitor/core";
import { useEffect, useState } from "react";

type HomeAppOnlyProps = {
  initialIsNativeApp: boolean;
  children: React.ReactNode;
};

export default function HomeAppOnly({ initialIsNativeApp, children }: HomeAppOnlyProps) {
  const [isNativeApp, setIsNativeApp] = useState(initialIsNativeApp);

  useEffect(() => {
    setIsNativeApp(Capacitor.isNativePlatform());
  }, []);

  if (!isNativeApp) return null;
  return <>{children}</>;
}

