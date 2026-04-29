import type { CapacitorConfig } from "@capacitor/cli";
import { KeyboardResize, KeyboardStyle } from "@capacitor/keyboard";

const config: CapacitorConfig = {
  appId: "co.kr.bogopa.app",
  appName: "Bogopa",
  backgroundColor: "#ffffff",
  webDir: "public",
  appendUserAgent: " BogopaNativeApp",
  server: {
    url: process.env.CAPACITOR_SERVER_URL ?? "https://www.bogopa.co.kr",
    androidScheme: "https",
    allowNavigation: ["bogopa.co.kr", "*.bogopa.co.kr", "localhost", "127.0.0.1"],
    errorPath: "offline.html",
  },
  plugins: {
    Keyboard: {
      resize: KeyboardResize.None,
      style: KeyboardStyle.Light,
      resizeOnFullScreen: false,
    },
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 650,
      backgroundColor: "#ffffff",
      showSpinner: false,
      androidScaleType: "CENTER_CROP",
      iosSpinnerStyle: "small",
    },
  },
};

export default config;
