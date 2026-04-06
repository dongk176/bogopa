"use client";

import Link from "next/link";
import { ChangeEvent, FormEvent, KeyboardEvent as ReactKeyboardEvent, Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import UserProfileMenu from "@/app/_components/UserProfileMenu";
import { persistOnboardingStep } from "@/lib/onboarding-client";
import HomeConfirmModal from "@/app/_components/HomeConfirmModal";
import useMobileInputFocus from "@/app/_components/useMobileInputFocus";

type StepOneGender = "Male" | "Female" | "Other";
type RelationshipKey = "mother" | "father" | "olderSister" | "youngerSibling" | "olderBrother" | "partner";

type StepThreeData = {
  personaImageName?: string;
  personaImageKey?: string;
  personaImageSource?: "default" | "upload";
  personaImageUrl?: string;
  relationship: string;
  personaName: string;
  personaGender: "male" | "female";
  userNickname: string;
  step: number;
  updatedAt: string;
};

const STORAGE_KEY = "bogopa_profile_step3";
const STEP_ONE_STORAGE_KEY = "bogopa_profile_step1";
const FORCE_RELATIONSHIP_VIEW_KEY = "bogopa_force_step2_relationship_view";
const REQUIRED_ERROR_TEXT_CLASS = "ml-1 text-sm";
const REQUIRED_ERROR_TEXT_STYLE = { color: "#8b1f1f" } as const;
const MAX_IMAGE_FILE_SIZE = 10 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 1600;
const TARGET_IMAGE_BYTES = 900 * 1024;
const RELATIONSHIP_KEYS: RelationshipKey[] = [
  "mother",
  "father",
  "olderSister",
  "youngerSibling",
  "olderBrother",
  "partner",
];

function getRelationshipLabel(key: RelationshipKey, gender: StepOneGender | null) {
  if (key === "mother") return "엄마";
  if (key === "father") return "아빠";
  if (key === "olderSister") return gender === "Male" ? "누나" : gender === "Female" ? "언니" : "누나/언니";
  if (key === "youngerSibling") return "남동생/여동생";
  if (key === "olderBrother") return gender === "Male" ? "형" : gender === "Female" ? "오빠" : "형/오빠";
  if (key === "partner") return "연인/배우자";
  return "관계";
}

function inferRelationshipSelection(savedRelationship: string, gender: StepOneGender | null) {
  const normalized = savedRelationship.trim();
  if (normalized === "엄마") return "mother";
  if (normalized === "아빠") return "father";
  if (normalized === "누나" || normalized === "언니" || normalized === "누나/언니") return "olderSister";
  if (normalized === "형" || normalized === "오빠" || normalized === "형/오빠") return "olderBrother";
  if (normalized === "남동생" || normalized === "여동생" || normalized === "남동생/여동생") return "youngerSibling";
  if (normalized === "연인" || normalized === "배우자" || normalized === "연인/배우자") return "partner";

  for (const key of RELATIONSHIP_KEYS) {
    if (savedRelationship === getRelationshipLabel(key, gender)) {
      return key;
    }
  }
  return null;
}

function inferGenderByRelationshipKey(key: RelationshipKey, userGender: StepOneGender | null): "male" | "female" | null {
  if (key === "mother" || key === "olderSister") return "female";
  if (key === "father" || key === "olderBrother") return "male";
  if (key === "partner") {
    if (userGender === "Male") return "female";
    if (userGender === "Female") return "male";
  }
  return null;
}

function pickRandomValue(values: string[]) {
  if (!values.length) return "";
  return values[Math.floor(Math.random() * values.length)] || values[0];
}

function getDefaultPersonaImageCandidates(
  relationship: RelationshipKey | null,
  personaGender: "male" | "female",
) {
  if (relationship === "mother") {
    return ["/profile/mom.webp", "/profile/mom-2.webp", "/profile/mom-3.webp", "/profile/mom-4.webp"];
  }
  if (relationship === "father") {
    return ["/profile/dad.webp", "/profile/dad-2.webp", "/profile/dad-3.webp", "/profile/dad-4.webp"];
  }
  if (relationship === "olderSister") {
    return [
      "/profile/old sister.webp",
      "/profile/old sister-2.webp",
      "/profile/old sister-3.webp",
      "/profile/old sister-4.webp",
    ];
  }
  if (relationship === "olderBrother") {
    return [
      "/profile/old brother.webp",
      "/profile/old brother-2.webp",
      "/profile/old brother-3.webp",
      "/profile/old brother-4.webp",
    ];
  }
  if (relationship === "youngerSibling") {
    return personaGender === "male"
      ? [
          "/profile/young brother.webp",
          "/profile/young brother-2.webp",
          "/profile/young brother-3.webp",
          "/profile/young brother-4.webp",
          "/profile/young brother-5.webp",
        ]
      : ["/profile/young sister.webp", "/profile/young sister-2.webp", "/profile/young sister-3.webp", "/profile/young sister-4.webp"];
  }
  if (relationship === "partner") {
    return personaGender === "male"
      ? [
          "/profile/husband.webp",
          "/profile/husband-2.webp",
          "/profile/husband-3.webp",
          "/profile/husband-4.webp",
          "/profile/husband-5.webp",
          "/profile/husband-6.webp",
        ]
      : ["/profile/wife.webp", "/profile/wife-2.webp", "/profile/wife-3.webp", "/profile/wife-4.webp", "/profile/wife-5.webp"];
  }
  return [];
}

function isDefaultProfileImage(url: string) {
  return url.startsWith("/profile/") || url.startsWith("/img/");
}

function getNicknamePlaceholder(relationship: RelationshipKey | null, userGender: StepOneGender | null) {
  if (relationship === "mother" || relationship === "father") {
    if (userGender === "Male") return "아들아, 우리 아들";
    if (userGender === "Female") return "지민아, 우리 딸";
    return "우리 애기, 아가";
  }

  if (relationship === "olderSister" || relationship === "olderBrother") {
    return "동생아, 우리 막내";
  }

  if (relationship === "youngerSibling") {
    if (userGender === "Male") return "형/오빠, 형아";
    if (userGender === "Female") return "누나/언니, 누나";
    return "형/오빠, 누나/언니";
  }

  if (relationship === "partner") {
    return "자기야, 여보";
  }

  return "평소에 불러주던 애칭";
}

function getPersonaNamePlaceholder(
  relationship: RelationshipKey | null,
  personaGender: "male" | "female",
  userGender: StepOneGender | null,
  relationshipLabelOverride: string | null = null,
) {
  if (relationship === "mother") return "엄마, 어머니";
  if (relationship === "father") return "아빠, 아버지";
  if (relationship === "olderSister") {
    if (relationshipLabelOverride === "누나") return "누나, 큰누나";
    if (relationshipLabelOverride === "언니") return "언니, 큰언니";
    return userGender === "Male" ? "누나, 큰누나" : userGender === "Female" ? "언니, 큰언니" : "누나/언니";
  }
  if (relationship === "olderBrother") {
    if (relationshipLabelOverride === "형") return "형, 큰형";
    if (relationshipLabelOverride === "오빠") return "오빠, 큰오빠";
    return userGender === "Female" ? "오빠, 큰오빠" : userGender === "Male" ? "형, 큰형" : "형/오빠";
  }
  if (relationship === "youngerSibling") return personaGender === "male" ? "남동생, 동생" : "여동생, 동생";
  if (relationship === "partner") return personaGender === "male" ? "남편, 자기" : "아내, 자기";
  return "울 애기, 우리 엄마, 야";
}

function ArrowLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M19 12H5" />
      <path d="m11 6-6 6 6 6" />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 animate-spin" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 3a9 9 0 1 0 9 9" />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4.5 7.5h3l1.2-2h6.6l1.2 2h3A1.5 1.5 0 0 1 21 9v9A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 18V9a1.5 1.5 0 0 1 1.5-1.5Z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}

function ShuffleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M20 11a8 8 0 0 0-14.7-4" />
      <path d="M4 5v4h4" />
      <path d="M4 13a8 8 0 0 0 14.7 4" />
      <path d="M20 19v-4h-4" />
    </svg>
  );
}

function UserIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="8" r="3.4" />
      <path d="M5.5 19.4a6.6 6.6 0 0 1 13 0" />
    </svg>
  );
}

function toWebpFileName(name: string) {
  const base = name.replace(/\.[a-z0-9]+$/i, "").trim() || "persona";
  return `${base}.webp`;
}

function loadImageElement(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("이미지를 불러오지 못했습니다."));
    };
    image.src = objectUrl;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("이미지 변환에 실패했습니다."));
          return;
        }
        resolve(blob);
      },
      "image/webp",
      quality,
    );
  });
}

async function compressPersonaImage(file: File) {
  if (!file.type.startsWith("image/")) return file;

  const image = await loadImageElement(file);
  const longerSide = Math.max(image.naturalWidth, image.naturalHeight);
  const scale = longerSide > MAX_IMAGE_DIMENSION ? MAX_IMAGE_DIMENSION / longerSide : 1;
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) return file;
  context.drawImage(image, 0, 0, width, height);

  let quality = 0.86;
  let blob = await canvasToBlob(canvas, quality);

  while (blob.size > TARGET_IMAGE_BYTES && quality > 0.52) {
    quality -= 0.08;
    blob = await canvasToBlob(canvas, quality);
  }

  const optimized = new File([blob], toWebpFileName(file.name), {
    type: "image/webp",
    lastModified: Date.now(),
  });

  if (optimized.size >= file.size && file.size <= TARGET_IMAGE_BYTES) {
    return file;
  }
  return optimized;
}

function StepTwoPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isNativeAppRuntime, setIsNativeAppRuntime] = useState(false);
  const isInputFocused = useMobileInputFocus();
  const keyboardInsetExpr = isNativeAppRuntime
    ? "max(var(--bogopa-keyboard-height, 0px), 320px)"
    : "var(--bogopa-keyboard-height, 0px)";
  const mobileFocusedMainStyle = isInputFocused
    ? ({
        paddingBottom:
          `calc(${keyboardInsetExpr} + env(safe-area-inset-bottom) + 7.5rem)`,
        scrollPaddingBottom:
          `calc(${keyboardInsetExpr} + env(safe-area-inset-bottom) + 7.5rem)`,
      } as const)
    : undefined;
  const mobileFooterStyle = isNativeAppRuntime
    ? ({ bottom: "var(--bogopa-keyboard-height, 0px)" } as const)
    : undefined;
  const transitionTimeoutRef = useRef<number | null>(null);
  const relationshipSectionRef = useRef<HTMLDivElement | null>(null);
  const genderSectionRef = useRef<HTMLDivElement | null>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const nicknameInputRef = useRef<HTMLInputElement | null>(null);
  const [personaImageName, setPersonaImageName] = useState("");
  const [personaImageKey, setPersonaImageKey] = useState("");
  const [personaImageSource, setPersonaImageSource] = useState<"default" | "upload">("default");
  const [personaImageUrl, setPersonaImageUrl] = useState("");
  const [personaFile, setPersonaFile] = useState<File | null>(null);
  const [hasCustomImage, setHasCustomImage] = useState(false);
  const [previewUrl, setPreviewUrl] = useState("");
  const [relationship, setRelationship] = useState<RelationshipKey | null>(null);
  const [relationshipLabelOverride, setRelationshipLabelOverride] = useState<string | null>(null);
  const [pendingIntroGenderRelationship, setPendingIntroGenderRelationship] = useState<RelationshipKey | null>(null);
  const [isIntroGenderConfirmed, setIsIntroGenderConfirmed] = useState(false);
  const [userGender, setUserGender] = useState<StepOneGender | null>(null);
  const [personaName, setPersonaName] = useState("");
  const [personaGender, setPersonaGender] = useState<"male" | "female">("female");
  const [userNickname, setUserNickname] = useState("");
  const [relationshipError, setRelationshipError] = useState("");
  const [nameError, setNameError] = useState("");
  const [nicknameError, setNicknameError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [imageError, setImageError] = useState("");
  const [isImageProcessing, setIsImageProcessing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isHomeModalOpen, setIsHomeModalOpen] = useState(false);
  const [isStepReady, setIsStepReady] = useState(false);
  const [viewMode, setViewMode] = useState<"relationship" | "form">("relationship");
  const [isSwitchingToForm, setIsSwitchingToForm] = useState(false);
  const [isFormEntering, setIsFormEntering] = useState(false);
  const [isRelationshipAttention, setIsRelationshipAttention] = useState(false);
  const [isGenderAttention, setIsGenderAttention] = useState(false);
  const [isNameAttention, setIsNameAttention] = useState(false);
  const [isNicknameAttention, setIsNicknameAttention] = useState(false);
  const currentStep = viewMode === "relationship" ? 2 : 3;
  const progressWidthClass = viewMode === "relationship" ? "w-1/2" : "w-3/4";
  const forceRelationshipFromStep1 = searchParams.get("entry") === "step1";
  const forceFormFromStep4 = searchParams.get("entry") === "step4";
  const step1EntryNonce = searchParams.get("t") ?? "";

  function triggerAttention(element: HTMLElement | null, setAttention: (next: boolean) => void, focus?: () => void) {
    setAttention(true);
    element?.scrollIntoView({ behavior: "auto", block: "center" });
    element?.animate(
      [
        { transform: "translateX(0)" },
        { transform: "translateX(-6px)" },
        { transform: "translateX(6px)" },
        { transform: "translateX(-4px)" },
        { transform: "translateX(0)" },
      ],
      { duration: 320, easing: "ease-out" },
    );
    if (focus) {
      requestAnimationFrame(() => focus());
    }
    window.setTimeout(() => setAttention(false), 700);
  }

  function handleFormKeyDownCapture(event: ReactKeyboardEvent<HTMLFormElement>) {
    if (event.key !== "Enter") return;
    const target = event.target as EventTarget | null;
    if (target instanceof HTMLTextAreaElement) return;
    if (target instanceof HTMLButtonElement) return;
    event.preventDefault();
  }

  useEffect(() => {
    setIsNativeAppRuntime(document.documentElement.classList.contains("native-app"));
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrl.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    return () => {
      if (transitionTimeoutRef.current !== null) {
        window.clearTimeout(transitionTimeoutRef.current);
      }
    };
  }, []);

  function requiresGenderSelection(item: RelationshipKey) {
    if (item === "youngerSibling" || item === "partner") return true;
    if (userGender === "Other" && (item === "olderSister" || item === "olderBrother")) return true;
    return false;
  }

  function getFinalRelationshipLabel(item: RelationshipKey | null) {
    if (!item) return "";
    if (
      userGender === "Other" &&
      (item === "olderSister" || item === "olderBrother") &&
      relationshipLabelOverride
    ) {
      return relationshipLabelOverride.trim();
    }
    return getRelationshipLabel(item, userGender).trim();
  }

  const finalRelationshipForValidation = getFinalRelationshipLabel(relationship);
  const isRelationshipStepValid =
    Boolean(relationship) &&
    (!relationship || !requiresGenderSelection(relationship) || isIntroGenderConfirmed);
  const isFormStepValid =
    finalRelationshipForValidation.length > 0 &&
    personaName.trim().length > 0 &&
    userNickname.trim().length > 0 &&
    !isImageProcessing &&
    !imageError;
  const isStepTwoNextDisabled =
    !isStepReady || isSubmitting || (viewMode === "relationship" ? !isRelationshipStepValid : !isFormStepValid);

  function applyRelationshipSelection(item: RelationshipKey) {
    setRelationship(item);
    setRelationshipLabelOverride(null);
    setIsRelationshipAttention(false);
    if (!requiresGenderSelection(item)) {
      const inferred = inferGenderByRelationshipKey(item, userGender);
      if (inferred) setPersonaGender(inferred);
      setIsIntroGenderConfirmed(true);
      setIsGenderAttention(false);
    } else {
      setIsIntroGenderConfirmed(false);
    }
    if (relationshipError) setRelationshipError("");
  }

  function transitionToForm() {
    if (transitionTimeoutRef.current !== null) {
      window.clearTimeout(transitionTimeoutRef.current);
    }
    setIsSwitchingToForm(true);
    transitionTimeoutRef.current = window.setTimeout(() => {
      setViewMode("form");
      setIsSwitchingToForm(false);
      setIsFormEntering(true);
      requestAnimationFrame(() => setIsFormEntering(false));
      transitionTimeoutRef.current = null;
    }, 220);
  }

  function handleIntroNext() {
    if (!relationship) {
      setRelationshipError("관계를 선택해주세요.");
      triggerAttention(relationshipSectionRef.current, setIsRelationshipAttention);
      return;
    }

    if (requiresGenderSelection(relationship) && !isIntroGenderConfirmed) {
      setRelationshipError(
        userGender === "Other" && (relationship === "olderSister" || relationship === "olderBrother")
          ? "호칭을 선택해주세요."
          : "성별을 선택해주세요.",
      );
      triggerAttention(genderSectionRef.current, setIsGenderAttention);
      return;
    }

    setRelationshipError("");
    transitionToForm();
  }

  useEffect(() => {
    setIsStepReady(false);
    let nextGender: StepOneGender | null = null;
    let hasSavedRelationship = false;
    let canSkipRelationshipView = false;
    const forceRelationshipView = localStorage.getItem(FORCE_RELATIONSHIP_VIEW_KEY) === "1";
    if (forceRelationshipView) {
      localStorage.removeItem(FORCE_RELATIONSHIP_VIEW_KEY);
    }
    const rawStep1 = localStorage.getItem(STEP_ONE_STORAGE_KEY);
    if (rawStep1) {
      try {
        const parsed = JSON.parse(rawStep1) as { gender?: string };
        if (parsed.gender === "Male" || parsed.gender === "Female" || parsed.gender === "Other") {
          nextGender = parsed.gender;
        }
      } catch {
        nextGender = null;
      }
    }
    setUserGender(nextGender);

    const rawStep3 = localStorage.getItem(STORAGE_KEY);
    if (!rawStep3) {
      setIsStepReady(true);
      return;
    }

    try {
      const saved = JSON.parse(rawStep3) as Partial<StepThreeData>;

      if (typeof saved.personaName === "string") setPersonaName(saved.personaName);
      if (typeof saved.personaImageName === "string") setPersonaImageName(saved.personaImageName);
      if (typeof saved.personaImageKey === "string") {
        setPersonaImageKey(saved.personaImageKey);
        setHasCustomImage(saved.personaImageKey.trim().length > 0);
        if (saved.personaImageKey.trim().length > 0) {
          setPersonaImageSource("upload");
        }
      }
      if (saved.personaImageSource === "upload" || saved.personaImageSource === "default") {
        setPersonaImageSource(saved.personaImageSource);
      }
      if (typeof saved.personaImageUrl === "string") {
        setPersonaImageUrl(saved.personaImageUrl);
        setPreviewUrl(saved.personaImageUrl);
        if (saved.personaImageUrl.trim().length > 0 && !isDefaultProfileImage(saved.personaImageUrl)) {
          setHasCustomImage(true);
        }
      }
      if (saved.personaGender === "male" || saved.personaGender === "female") setPersonaGender(saved.personaGender);
      if (typeof saved.userNickname === "string") setUserNickname(saved.userNickname);
      if (typeof saved.userNickname !== "string" && typeof (saved as { memo?: string }).memo === "string") {
        setUserNickname((saved as { memo?: string }).memo || "");
      }

      if (typeof saved.relationship === "string" && saved.relationship.trim().length > 0) {
        const savedRelationshipLabel = saved.relationship.trim();
        const selected = inferRelationshipSelection(savedRelationshipLabel, nextGender);
        if (selected) {
          setRelationship(selected);
          hasSavedRelationship = true;
          if (
            nextGender === "Other" &&
            selected === "olderSister" &&
            (savedRelationshipLabel === "누나" || savedRelationshipLabel === "언니")
          ) {
            setRelationshipLabelOverride(savedRelationshipLabel);
            setIsIntroGenderConfirmed(true);
            canSkipRelationshipView = true;
          } else if (
            nextGender === "Other" &&
            selected === "olderBrother" &&
            (savedRelationshipLabel === "형" || savedRelationshipLabel === "오빠")
          ) {
            setRelationshipLabelOverride(savedRelationshipLabel);
            setIsIntroGenderConfirmed(true);
            canSkipRelationshipView = true;
          } else if (nextGender === "Other" && (selected === "olderSister" || selected === "olderBrother")) {
            setRelationshipLabelOverride(null);
            setIsIntroGenderConfirmed(false);
            canSkipRelationshipView = false;
          } else if (selected === "youngerSibling" || selected === "partner") {
            const hasPersonaGender = Boolean(saved.personaGender === "male" || saved.personaGender === "female");
            setIsIntroGenderConfirmed(hasPersonaGender);
            canSkipRelationshipView = hasPersonaGender;
          } else {
            setIsIntroGenderConfirmed(true);
            canSkipRelationshipView = true;
          }
        }
      }
    } catch {
      // noop
    }

    if (forceFormFromStep4 && hasSavedRelationship) {
      setViewMode("form");
      setIsSwitchingToForm(false);
      setIsFormEntering(false);
    } else if (hasSavedRelationship && canSkipRelationshipView && !forceRelationshipView && !forceRelationshipFromStep1) {
      setViewMode("form");
      setIsSwitchingToForm(false);
      setIsFormEntering(false);
    } else {
      setViewMode("relationship");
      setIsSwitchingToForm(false);
      setIsFormEntering(false);
    }
    setIsStepReady(true);
  }, [forceRelationshipFromStep1, forceFormFromStep4, step1EntryNonce]);

  useEffect(() => {
    if (!forceRelationshipFromStep1) return;
    setViewMode("relationship");
    setIsSwitchingToForm(false);
    setIsFormEntering(false);
    setRelationshipError("");
  }, [forceRelationshipFromStep1, step1EntryNonce]);

  useEffect(() => {
    if (hasCustomImage || personaFile) return;

    const candidates = getDefaultPersonaImageCandidates(relationship, personaGender);
    const currentIsDefault = isDefaultProfileImage(personaImageUrl);

    if (candidates.length === 0) {
      if (currentIsDefault) {
        setPersonaImageUrl("");
        setPersonaImageSource("default");
        setPersonaImageName("");
        if (!previewUrl.startsWith("blob:")) setPreviewUrl("");
      }
      return;
    }

    const currentDefaultImage = currentIsDefault ? personaImageUrl : "";
    if (currentDefaultImage && candidates.includes(currentDefaultImage)) {
      if (previewUrl === currentDefaultImage || !previewUrl) return;
    }

    const nextDefaultImage = pickRandomValue(candidates);
    if (!nextDefaultImage) return;

    if (previewUrl.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    setPersonaImageUrl(nextDefaultImage);
    setPersonaImageSource("default");
    setPreviewUrl(nextDefaultImage);
    setPersonaImageName(nextDefaultImage.split("/").pop() || "");
  }, [relationship, personaGender, hasCustomImage, personaFile, personaImageUrl, previewUrl]);

  useEffect(() => {
    const finalRelationship = getFinalRelationshipLabel(relationship);

    const trimmedName = personaName.trim();
    const trimmedNickname = userNickname.trim();

    const hasDraftContent = Boolean(
      finalRelationship ||
        trimmedName ||
        trimmedNickname ||
        personaImageUrl ||
        personaImageKey ||
        personaImageName,
    );

    if (!hasDraftContent) return;

    const payload: StepThreeData = {
      personaImageName: personaImageName || undefined,
      personaImageKey: personaImageKey || undefined,
      personaImageSource,
      personaImageUrl: personaImageUrl || undefined,
      relationship: finalRelationship,
      personaName: trimmedName,
      personaGender,
      userNickname: trimmedNickname,
      step: 2,
      updatedAt: new Date().toISOString(),
    };

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, [
    relationship,
    relationshipLabelOverride,
    userGender,
    personaName,
    userNickname,
    personaGender,
    personaImageName,
    personaImageKey,
    personaImageSource,
    personaImageUrl,
  ]);

  async function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setImageError("이미지 파일만 업로드할 수 있습니다.");
      event.target.value = "";
      return;
    }

    if (file.size >= MAX_IMAGE_FILE_SIZE) {
      setImageError("이미지 파일은 10MB 미만만 업로드할 수 있습니다.");
      event.target.value = "";
      return;
    }

    setImageError("");
    setIsImageProcessing(true);
    setHasCustomImage(true);
    setPersonaImageSource("upload");

    try {
      const optimized = await compressPersonaImage(file);
      if (previewUrl.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
      const nextUrl = URL.createObjectURL(optimized);
      setPreviewUrl(nextUrl);
      setPersonaFile(optimized);
      setPersonaImageName(optimized.name);
    } catch (error) {
      setImageError(error instanceof Error ? error.message : "이미지 처리에 실패했습니다.");
      event.target.value = "";
    } finally {
      setIsImageProcessing(false);
    }
  }

  function handleCycleDefaultImage() {
    const candidates = getDefaultPersonaImageCandidates(relationship, personaGender);
    if (candidates.length === 0) return;

    const current = isDefaultProfileImage(previewUrl) ? previewUrl : personaImageUrl;
    const currentIndex = candidates.findIndex((item) => item === current);
    const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % candidates.length : 0;
    const nextCandidate = candidates[nextIndex] || candidates[0];
    if (!nextCandidate) return;

    if (previewUrl.startsWith("blob:")) URL.revokeObjectURL(previewUrl);

    setPersonaFile(null);
    setHasCustomImage(false);
    setPersonaImageKey("");
    setPersonaImageSource("default");
    setImageError("");
    setPreviewUrl(nextCandidate);
    setPersonaImageUrl(nextCandidate);
    setPersonaImageName(nextCandidate.split("/").pop() || "");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isImageProcessing) {
      setSaveError("이미지를 처리 중입니다. 잠시만 기다려주세요.");
      return;
    }

    if (imageError) {
      setSaveError(imageError);
      return;
    }

    if (relationship && requiresGenderSelection(relationship) && !isIntroGenderConfirmed) {
      setViewMode("relationship");
      setPendingIntroGenderRelationship(relationship);
      setRelationshipError(
        userGender === "Other" && (relationship === "olderSister" || relationship === "olderBrother")
          ? "호칭을 선택해주세요."
          : "성별을 선택해주세요.",
      );
      requestAnimationFrame(() => {
        triggerAttention(genderSectionRef.current, setIsGenderAttention);
      });
      return;
    }

    const finalRelationship = getFinalRelationshipLabel(relationship);
    const nameTarget = finalRelationship || "관계";

    const nextRelationshipError = finalRelationship.length === 0 ? "관계를 선택해주세요." : "";
    const trimmedName = personaName.trim();
    const nextNameError = trimmedName.length === 0 ? `${nameTarget}의 이름 또는 애칭을 입력해주세요.` : "";
    const trimmedNickname = userNickname.trim();
    const nextNicknameError = trimmedNickname.length === 0 ? `${nameTarget}가 나를 불러주던 애칭을 입력해주세요.` : "";

    setRelationshipError(nextRelationshipError);
    setNameError(nextNameError);
    setNicknameError(nextNicknameError);
    setSaveError("");

    if (nextRelationshipError) {
      setViewMode("relationship");
      setPendingIntroGenderRelationship(relationship);
      requestAnimationFrame(() => {
        triggerAttention(relationshipSectionRef.current, setIsRelationshipAttention);
      });
      return;
    }

    if (nextNameError) {
      triggerAttention(nameInputRef.current, setIsNameAttention, () => nameInputRef.current?.focus());
      return;
    }

    if (nextNicknameError) {
      triggerAttention(nicknameInputRef.current, setIsNicknameAttention, () => nicknameInputRef.current?.focus());
      return;
    }

    setIsSubmitting(true);

    let finalImageKey = personaImageKey;
    let finalImageSource: "default" | "upload" = personaImageSource;
    let finalImageUrl = personaImageUrl;

    if (personaFile) {
      const formData = new FormData();
      formData.append("file", personaFile);

      try {
        const uploadResponse = await fetch("/api/upload/persona-image", {
          method: "POST",
          body: formData,
        });

        if (!uploadResponse.ok) {
          const body = (await uploadResponse.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error || "이미지 업로드에 실패했습니다.");
        }

        const uploadBody = (await uploadResponse.json()) as {
          key: string;
          url: string;
          avatarSource?: "upload";
          avatarKey?: string;
          avatarUrl?: string;
        };
        finalImageKey = uploadBody.avatarKey || uploadBody.key;
        finalImageSource = uploadBody.avatarSource || "upload";
        finalImageUrl = uploadBody.avatarUrl || uploadBody.url;
      } catch (error) {
        setIsSubmitting(false);
        setSaveError(error instanceof Error ? error.message : "이미지 업로드에 실패했습니다.");
        return;
      }
    }

    if (!finalImageUrl) {
      const defaultImage = pickRandomValue(getDefaultPersonaImageCandidates(relationship, personaGender));
      if (defaultImage) {
        finalImageUrl = defaultImage;
        finalImageSource = "default";
      }
    }

    const payload: StepThreeData = {
      personaImageName: personaImageName || undefined,
      personaImageKey: finalImageKey || undefined,
      personaImageSource: finalImageSource,
      personaImageUrl: finalImageUrl || undefined,
      relationship: finalRelationship,
      personaName: trimmedName,
      personaGender,
      userNickname: trimmedNickname,
      step: 2,
      updatedAt: new Date().toISOString(),
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    setPersonaImageKey(finalImageKey);
    setPersonaImageSource(finalImageSource);
    setPersonaImageUrl(finalImageUrl);

    void persistOnboardingStep(2, payload).catch((error) => {
      console.error("[step-2] remote save failed, continue local flow", error);
    });
    router.push("/step-3");
  }

  return (
    <div className="relative flex h-[100dvh] overflow-hidden flex-col bg-[#faf9f5] text-[#2f342e]">
      <header className="fixed inset-x-0 top-0 z-50 w-full bg-[#faf9f5] pt-[var(--native-safe-top)]">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-center px-6 md:px-12">
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium text-[#655d5a]">Step {currentStep}/4</span>
            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-[#d6ddd8]">
              <div className={`h-full bg-[#4a626d] transition-all duration-500 ${progressWidthClass}`} />
            </div>
          </div>
        </div>
      </header>

      <main
        className="flex min-h-0 flex-1 items-start justify-center overflow-y-auto overscroll-y-contain px-4 pb-36 pt-[calc(5rem+var(--native-safe-top))] [-webkit-overflow-scrolling:touch] md:items-center md:px-6 md:pb-12 md:pt-24"
        style={mobileFocusedMainStyle}
      >
        <div className="relative w-full max-w-xl overflow-visible rounded-none bg-transparent p-0 shadow-none md:overflow-hidden md:rounded-[2rem] md:bg-[#303733] md:p-12 md:shadow-[0_20px_40px_rgba(0,0,0,0.3)]">
          <div className="absolute -right-10 -top-10 -z-0 hidden h-40 w-40 bg-[#cde6f4]/20 [border-radius:40%_60%_70%_30%/40%_50%_60%_50%] md:block" />

          <div className="relative z-10">
            {viewMode === "relationship" ? (
              <div
                className={`transition-all duration-300 ease-out ${
                  isSwitchingToForm ? "translate-y-1 opacity-0" : "translate-y-0 opacity-100"
                }`}
              >
                <div className="mb-8 text-center md:text-left">
                  <h1 className="font-headline mb-3 text-3xl font-bold tracking-tight text-[#f0f5f2] md:text-4xl">
                    기억 속 그 사람
                  </h1>
                  <p className="text-sm text-[#f0f5f2]/80">먼저 관계를 선택해주세요.</p>
                </div>

                <div
                  ref={relationshipSectionRef}
                  className={`rounded-2xl transition-colors ${isRelationshipAttention ? "bg-[#3f2f2f]/15 outline outline-2 outline-[#ff7b7b]" : ""}`}
                >
                  <p className="mb-2 ml-1 text-left text-sm font-semibold text-[#f0f5f2]">
                    관계 <span className="text-[#ffb4ab]">*</span>
                  </p>

                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {RELATIONSHIP_KEYS.map((item) => {
                      const isIntroActive = relationship === item;
                      return (
                        <button
                          key={`intro-${item}`}
                          type="button"
                          onClick={() => {
                            applyRelationshipSelection(item);
                            if (requiresGenderSelection(item)) {
                              setPendingIntroGenderRelationship(item);
                              return;
                            }
                            setPendingIntroGenderRelationship(null);
                          }}
                          className={`rounded-2xl px-4 py-3 text-sm font-semibold transition-all duration-300 hover:-translate-y-0.5 md:text-base ${
                            isIntroActive
                              ? "border border-[#4a626d] bg-[#4a626d] text-[#f0f9ff] hover:bg-[#3e5661]"
                              : "border border-[#afb3ac]/45 bg-[#f4f4ef] text-[#2f342e] hover:bg-white"
                          }`}
                        >
                          {getRelationshipLabel(item, userGender)}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {pendingIntroGenderRelationship ? (
                  <div
                    ref={genderSectionRef}
                    className={`mt-4 space-y-3 rounded-2xl border border-[#afb3ac]/45 bg-[#f4f4ef] p-4 transition-colors ${
                      isGenderAttention ? "bg-[#fff3f3] outline outline-2 outline-[#ff7b7b]" : ""
                    }`}
                  >
                    <p className="text-sm font-semibold text-[#2f342e]">
                      {userGender === "Other" &&
                      (pendingIntroGenderRelationship === "olderSister" || pendingIntroGenderRelationship === "olderBrother")
                        ? "호칭을 선택해주세요."
                        : "성별을 선택해주세요."}
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          if (pendingIntroGenderRelationship === "olderSister" && userGender === "Other") {
                            setRelationshipLabelOverride("누나");
                            setPersonaGender("female");
                          } else if (pendingIntroGenderRelationship === "olderBrother" && userGender === "Other") {
                            setRelationshipLabelOverride("형");
                            setPersonaGender("male");
                          } else {
                            setRelationshipLabelOverride(null);
                            setPersonaGender("male");
                          }
                          setIsIntroGenderConfirmed(true);
                          setIsGenderAttention(false);
                          if (relationshipError) setRelationshipError("");
                        }}
                        className={`rounded-2xl px-4 py-3 text-sm font-semibold transition-all duration-300 md:text-base ${
                          isIntroGenderConfirmed &&
                          (pendingIntroGenderRelationship === "olderSister" && userGender === "Other"
                            ? relationshipLabelOverride === "누나"
                            : pendingIntroGenderRelationship === "olderBrother" && userGender === "Other"
                              ? relationshipLabelOverride === "형"
                              : personaGender === "male")
                            ? "border border-[#4a626d] bg-[#4a626d] text-[#f0f9ff] hover:bg-[#3e5661]"
                            : "border border-[#afb3ac]/45 bg-[#f4f4ef] text-[#2f342e] hover:bg-white"
                        }`}
                      >
                        {pendingIntroGenderRelationship === "olderSister" && userGender === "Other"
                          ? "누나"
                          : pendingIntroGenderRelationship === "olderBrother" && userGender === "Other"
                            ? "형"
                            : "남성"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (pendingIntroGenderRelationship === "olderSister" && userGender === "Other") {
                            setRelationshipLabelOverride("언니");
                            setPersonaGender("female");
                          } else if (pendingIntroGenderRelationship === "olderBrother" && userGender === "Other") {
                            setRelationshipLabelOverride("오빠");
                            setPersonaGender("male");
                          } else {
                            setRelationshipLabelOverride(null);
                            setPersonaGender("female");
                          }
                          setIsIntroGenderConfirmed(true);
                          setIsGenderAttention(false);
                          if (relationshipError) setRelationshipError("");
                        }}
                        className={`rounded-2xl px-4 py-3 text-sm font-semibold transition-all duration-300 md:text-base ${
                          isIntroGenderConfirmed &&
                          (pendingIntroGenderRelationship === "olderSister" && userGender === "Other"
                            ? relationshipLabelOverride === "언니"
                            : pendingIntroGenderRelationship === "olderBrother" && userGender === "Other"
                              ? relationshipLabelOverride === "오빠"
                              : personaGender === "female")
                            ? "border border-[#4a626d] bg-[#4a626d] text-[#f0f9ff] hover:bg-[#3e5661]"
                            : "border border-[#afb3ac]/45 bg-[#f4f4ef] text-[#2f342e] hover:bg-white"
                        }`}
                      >
                        {pendingIntroGenderRelationship === "olderSister" && userGender === "Other"
                          ? "언니"
                          : pendingIntroGenderRelationship === "olderBrother" && userGender === "Other"
                            ? "오빠"
                            : "여성"}
                      </button>
                    </div>
                  </div>
                ) : null}

                {relationshipError ? <p className={REQUIRED_ERROR_TEXT_CLASS} style={REQUIRED_ERROR_TEXT_STYLE}>{relationshipError}</p> : null}

                <div className="mt-8 hidden md:grid md:grid-cols-2 md:gap-4">
                  <Link
                    href="/step-1"
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-[#f4f4ef] px-4 py-4 text-base font-semibold text-[#4a626d] shadow-[0_12px_30px_rgba(47,52,46,0.16)] transition-all duration-300 hover:bg-[#eceee8] active:scale-[0.98] md:rounded-2xl md:text-lg md:font-bold md:shadow-none"
                  >
                    <ArrowLeftIcon />
                    이전
                  </Link>
                  <button
                    type="button"
                    onClick={handleIntroNext}
                    disabled={isStepTwoNextDisabled}
                    className="group flex items-center justify-center gap-2 rounded-full bg-[#4a626d] px-4 py-4 text-base font-semibold text-[#f0f9ff] shadow-[0_12px_30px_rgba(47,52,46,0.28)] transition-all duration-300 hover:bg-[#3e5661] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 md:rounded-2xl md:text-lg md:font-bold md:shadow-lg"
                  >
                    다음으로
                    <span className="transition-transform group-hover:translate-x-1">
                      <ArrowRightIcon />
                    </span>
                  </button>
                </div>
              </div>
            ) : null}

            {viewMode === "form" ? (
            <div className={`transition-all duration-300 ease-out ${isFormEntering ? "translate-y-1 opacity-0" : "translate-y-0 opacity-100"}`}>
            <div className="mb-8 text-center md:text-left">
              <h1 className="font-headline mb-3 text-3xl font-bold tracking-tight text-[#f0f5f2] md:text-4xl">
                기억 속 그 사람
              </h1>
            </div>

            <form
              id="step-two-form"
              className="space-y-7"
              onSubmit={handleSubmit}
              onKeyDownCapture={handleFormKeyDownCapture}
              autoComplete="off"
            >
              <div className="flex flex-col items-center justify-center gap-3">
                <div className="mx-auto flex w-full flex-col items-center gap-2">
                  <label className="group relative mx-auto block w-full aspect-square cursor-pointer overflow-hidden rounded-xl border border-[#afb3ac]/45 bg-[#edeee8] shadow-sm">
                    {previewUrl ? (
                      <img src={previewUrl} alt="persona preview" className="h-full w-full object-cover" />
                    ) : (
                      <div className="grid h-full w-full place-items-center text-[#787c75]">
                        <UserIcon className="h-10 w-10" />
                      </div>
                    )}

                    <div className="absolute inset-0 grid place-items-center bg-black/15 text-white opacity-0 transition-opacity group-hover:opacity-100">
                      <CameraIcon />
                    </div>

                    <input type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
                  </label>

                  <button
                    type="button"
                    onClick={handleCycleDefaultImage}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#afb3ac]/45 bg-[#f4f4ef] text-[#4a626d] transition-colors hover:bg-[#eceee8]"
                    aria-label="다음 기본 사진"
                    title="다음 기본 사진"
                  >
                    <ShuffleIcon />
                  </button>
                </div>
                <p className="text-sm font-medium text-[#f0f5f2]">사진을 등록해주세요 (선택, 10MB 미만)</p>
                {imageError ? <p className="text-xs" style={REQUIRED_ERROR_TEXT_STYLE}>{imageError}</p> : null}
              </div>

              <div className="space-y-3">
                <label className="ml-1 block text-sm font-semibold text-[#f0f5f2]" htmlFor="persona-name">
                  {(finalRelationshipForValidation || "관계")}의 이름 또는 애칭 <span className="text-[#ffb4ab]">*</span>
                </label>
                <div className="group relative">
                  <input
                    id="persona-name"
                    ref={nameInputRef}
                    name="persona_name"
                    type="text"
                    value={personaName}
                    onChange={(e) => {
                      const nextValue = e.target.value;
                      setPersonaName(nextValue);
                      if (isNameAttention) setIsNameAttention(false);
                      if (nameError && nextValue.trim().length > 0) setNameError("");
                    }}
                    placeholder={getPersonaNamePlaceholder(relationship, personaGender, userGender, relationshipLabelOverride)}
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    data-lpignore="true"
                    data-form-type="other"
                    className={`w-full rounded-xl border bg-[#f4f4ef] px-6 py-4 pr-12 text-lg text-[#2f342e] placeholder:text-[#787c75] outline-none ring-0 transition-all duration-300 ${
                      nameError || isNameAttention ? "border-[#ff7b7b] ring-1 ring-[#ff7b7b]/35" : "border-[#afb3ac]/45"
                    }`}
                  />
                  <div className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-[#787c75]">
                    <UserIcon />
                  </div>
                </div>
                {nameError ? <p className={REQUIRED_ERROR_TEXT_CLASS} style={REQUIRED_ERROR_TEXT_STYLE}>{nameError}</p> : null}
              </div>

              <div className="space-y-3">
                <div className="ml-1 flex items-center justify-between">
                  <label className="block text-sm font-semibold text-[#f0f5f2]" htmlFor="persona-user-nickname">
                    {(finalRelationshipForValidation || "관계")}가 나를 불러주던 애칭 <span className="text-[#ffb4ab]">*</span>
                  </label>
                </div>
                <input
                  id="persona-user-nickname"
                  ref={nicknameInputRef}
                  name="persona_user_nickname"
                  type="text"
                  value={userNickname}
                  onChange={(e) => {
                    const nextValue = e.target.value;
                    setUserNickname(nextValue);
                    if (isNicknameAttention) setIsNicknameAttention(false);
                    if (nicknameError && nextValue.trim().length > 0) setNicknameError("");
                  }}
                  placeholder={getNicknamePlaceholder(relationship, userGender)}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  data-lpignore="true"
                  data-form-type="other"
                  className={`w-full rounded-xl border bg-[#f4f4ef] px-4 py-4 text-[#2f342e] placeholder:text-[#787c75] outline-none ring-0 transition-all ${
                    nicknameError || isNicknameAttention ? "border-[#ff7b7b] ring-1 ring-[#ff7b7b]/35" : "border-[#afb3ac]/45"
                  }`}
                />
                {nicknameError ? <p className={REQUIRED_ERROR_TEXT_CLASS} style={REQUIRED_ERROR_TEXT_STYLE}>{nicknameError}</p> : null}
              </div>

              <div className="pt-0 md:pt-2">
                <div className="hidden md:grid md:grid-cols-2 md:gap-4">
                  <button
                    type="button"
                    onClick={() => setViewMode("relationship")}
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-[#f4f4ef] px-4 py-4 text-base font-semibold text-[#4a626d] shadow-[0_12px_30px_rgba(47,52,46,0.16)] transition-all duration-300 hover:bg-[#eceee8] active:scale-[0.98] md:rounded-2xl md:text-lg md:font-bold md:shadow-none"
                  >
                    <ArrowLeftIcon />
                    이전
                  </button>

                  <button
                    type="submit"
                    disabled={isStepTwoNextDisabled}
                    className="group flex items-center justify-center gap-2 rounded-full bg-[#4a626d] px-4 py-4 text-base font-semibold text-[#f0f9ff] shadow-[0_12px_30px_rgba(47,52,46,0.28)] transition-all duration-300 hover:bg-[#3e5661] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 md:rounded-2xl md:text-lg md:font-bold md:shadow-lg"
                  >
                    {isSubmitting || isImageProcessing ? (
                      <>
                        <SpinnerIcon />
                        {isImageProcessing ? "이미지 처리 중..." : "저장 중..."}
                      </>
                    ) : (
                      <>
                        다음으로
                        <span className="transition-transform group-hover:translate-x-1">
                          <ArrowRightIcon />
                        </span>
                      </>
                    )}
                  </button>
                </div>
                {saveError ? <p className="mt-3 text-center text-sm" style={REQUIRED_ERROR_TEXT_STYLE}>{saveError}</p> : null}
              </div>
            </form>
            </div>
            ) : null}
          </div>
        </div>
      </main>
      <div
        className="fixed bottom-0 left-0 right-0 z-[60] bg-[#303733]/96 px-6 pb-[calc(1.28rem+env(safe-area-inset-bottom))] pt-2 backdrop-blur-md md:hidden"
        style={mobileFooterStyle}
      >
        <div className="grid grid-cols-2 gap-2">
          {viewMode === "relationship" ? (
            <Link
              href="/step-1"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-[#f4f4ef] px-4 py-4 text-base font-semibold text-[#4a626d] shadow-[0_12px_30px_rgba(47,52,46,0.16)] transition-all duration-300 hover:bg-[#eceee8] active:scale-[0.98]"
            >
              <ArrowLeftIcon />
              이전
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => setViewMode("relationship")}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-[#f4f4ef] px-4 py-4 text-base font-semibold text-[#4a626d] shadow-[0_12px_30px_rgba(47,52,46,0.16)] transition-all duration-300 hover:bg-[#eceee8] active:scale-[0.98]"
            >
              <ArrowLeftIcon />
              이전
            </button>
          )}

          <button
            type={viewMode === "form" ? "submit" : "button"}
            form={viewMode === "form" ? "step-two-form" : undefined}
            onClick={viewMode === "relationship" ? handleIntroNext : undefined}
            disabled={isStepTwoNextDisabled}
            className="group flex items-center justify-center gap-2 rounded-full bg-[#4a626d] px-4 py-4 text-base font-semibold text-[#f0f9ff] shadow-[0_12px_30px_rgba(47,52,46,0.28)] transition-all duration-300 hover:bg-[#3e5661] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting || isImageProcessing ? (
              <>
                <SpinnerIcon />
                {isImageProcessing ? "이미지 처리 중..." : "저장 중..."}
              </>
            ) : (
              <>
                다음으로
                <span className="transition-transform group-hover:translate-x-1">
                  <ArrowRightIcon />
                </span>
              </>
            )}
          </button>
        </div>
      </div>
      <HomeConfirmModal 
        isOpen={isHomeModalOpen} 
        onClose={() => setIsHomeModalOpen(false)} 
      />
    </div>
  );
}

export default function StepTwoPage() {
  return (
    <Suspense fallback={null}>
      <StepTwoPageContent />
    </Suspense>
  );
}
