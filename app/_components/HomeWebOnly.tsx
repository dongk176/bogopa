"use client";

import { Capacitor } from "@capacitor/core";
import { useEffect, useState } from "react";

type HomeWebOnlyProps = {
  initialIsNativeApp: boolean;
  children: React.ReactNode;
};

export default function HomeWebOnly({ initialIsNativeApp, children }: HomeWebOnlyProps) {
  const [isNativeApp, setIsNativeApp] = useState(initialIsNativeApp);

  useEffect(() => {
    setIsNativeApp(Capacitor.isNativePlatform());
  }, []);

  if (isNativeApp) return null;
  return <>{children}</>;
}

