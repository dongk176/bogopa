"use client";

import Link from "next/link";
import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { persistOnboardingStep } from "@/lib/onboarding-client";

type StepOneGender = "Male" | "Female";
type RelationshipKey = "mother" | "father" | "olderSister" | "youngerSibling" | "olderBrother" | "partner" | "custom";

type StepThreeData = {
  personaImageName?: string;
  personaImageKey?: string;
  personaImageUrl?: string;
  relationship: string;
  personaName: string;
  personaGender: "male" | "female";
  userNickname: string;
  personaOccupation: string;
  step: number;
  updatedAt: string;
};

const STORAGE_KEY = "bogopa_profile_step3";
const STEP_ONE_STORAGE_KEY = "bogopa_profile_step1";
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
  "custom",
];

function getRelationshipLabel(key: RelationshipKey, gender: StepOneGender | null) {
  if (key === "mother") return "엄마";
  if (key === "father") return "아빠";
  if (key === "olderSister") return gender === "Male" ? "누나" : gender === "Female" ? "언니" : "누나/언니";
  if (key === "youngerSibling") return "남동생/여동생";
  if (key === "olderBrother") return gender === "Male" ? "형" : gender === "Female" ? "오빠" : "형/오빠";
  if (key === "partner") return "연인/배우자";
  return "직접 입력";
}

function inferRelationshipSelection(savedRelationship: string, gender: StepOneGender | null) {
  const keys = RELATIONSHIP_KEYS.filter((key) => key !== "custom");
  for (const key of keys) {
    if (savedRelationship === getRelationshipLabel(key, gender)) {
      return { key, custom: "" };
    }
  }
  return { key: "custom" as RelationshipKey, custom: savedRelationship };
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

function getNicknamePlaceholder(relationship: RelationshipKey | null, userGender: StepOneGender | null) {
  if (relationship === "mother" || relationship === "father") {
    if (userGender === "Male") return "예: 동민아, 우리 아들";
    if (userGender === "Female") return "예: 지민아, 우리 딸";
    return "예: 동민아, 우리 애기";
  }

  if (relationship === "olderSister" || relationship === "olderBrother") {
    return "예: 동생아, 우리 막내";
  }

  if (relationship === "youngerSibling") {
    if (userGender === "Male") return "예: 형/오빠, 형아";
    if (userGender === "Female") return "예: 누나/언니, 누나";
    return "예: 형/오빠, 누나/언니";
  }

  if (relationship === "partner") {
    return "예: 자기야, 여보";
  }

  return "예: 평소에 불러주던 애칭";
}

function getOccupationPlaceholder(
  relationship: RelationshipKey | null,
  personaGender: "male" | "female",
  userGender: StepOneGender | null,
) {
  const femaleJobs = "예: 간호사, 교사, 디자이너";
  const maleJobs = "예: 개발자, 회사원, 자영업";

  if (relationship === "mother") return "예: 주부, 간호사, 교사";
  if (relationship === "father") return "예: 회사원, 자영업, 기사";
  if (relationship === "olderSister") return "예: 디자이너, 마케터, 간호사";
  if (relationship === "olderBrother") return "예: 개발자, 회사원, 자영업";

  if (relationship === "youngerSibling") {
    return personaGender === "male" ? "예: 대학생, 개발자, 회사원" : "예: 대학생, 간호사, 디자이너";
  }

  if (relationship === "partner") {
    if (userGender === "Male") return femaleJobs;
    if (userGender === "Female") return maleJobs;
    return personaGender === "male" ? maleJobs : femaleJobs;
  }

  if (relationship === "custom") return "예: 그 사람의 실제 직업";
  return personaGender === "male" ? maleJobs : femaleJobs;
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

export default function StepThreePage() {
  const router = useRouter();
  const [personaImageName, setPersonaImageName] = useState("");
  const [personaImageKey, setPersonaImageKey] = useState("");
  const [personaImageUrl, setPersonaImageUrl] = useState("");
  const [personaFile, setPersonaFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [relationship, setRelationship] = useState<RelationshipKey | null>(null);
  const [customRelationship, setCustomRelationship] = useState("");
  const [userGender, setUserGender] = useState<StepOneGender | null>(null);
  const [personaName, setPersonaName] = useState("");
  const [personaOccupation, setPersonaOccupation] = useState("");
  const [personaGender, setPersonaGender] = useState<"male" | "female">("female");
  const [userNickname, setUserNickname] = useState("");
  const [isRelationshipOpen, setIsRelationshipOpen] = useState(true);
  const [isGenderOpen, setIsGenderOpen] = useState(true);
  const [relationshipError, setRelationshipError] = useState("");
  const [nameError, setNameError] = useState("");
  const [nicknameError, setNicknameError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [imageError, setImageError] = useState("");
  const [isImageProcessing, setIsImageProcessing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const shouldShowGenderSelector = relationship === "youngerSibling" || relationship === "custom";

  useEffect(() => {
    return () => {
      if (previewUrl.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    let nextGender: StepOneGender | null = null;
    const rawStep1 = localStorage.getItem(STEP_ONE_STORAGE_KEY);
    if (rawStep1) {
      try {
        const parsed = JSON.parse(rawStep1) as { gender?: string };
        if (parsed.gender === "Male" || parsed.gender === "Female") {
          nextGender = parsed.gender;
        }
      } catch {
        nextGender = null;
      }
    }
    setUserGender(nextGender);

    const rawStep3 = localStorage.getItem(STORAGE_KEY);
    if (!rawStep3) return;

    try {
      const saved = JSON.parse(rawStep3) as Partial<StepThreeData>;

      if (typeof saved.personaName === "string") setPersonaName(saved.personaName);
      if (typeof saved.personaOccupation === "string") setPersonaOccupation(saved.personaOccupation);
      if (typeof saved.personaImageName === "string") setPersonaImageName(saved.personaImageName);
      if (typeof saved.personaImageKey === "string") setPersonaImageKey(saved.personaImageKey);
      if (typeof saved.personaImageUrl === "string") {
        setPersonaImageUrl(saved.personaImageUrl);
        setPreviewUrl(saved.personaImageUrl);
      }
      if (saved.personaGender === "male" || saved.personaGender === "female") setPersonaGender(saved.personaGender);
      if (typeof saved.userNickname === "string") setUserNickname(saved.userNickname);
      if (typeof saved.userNickname !== "string" && typeof (saved as { memo?: string }).memo === "string") {
        setUserNickname((saved as { memo?: string }).memo || "");
      }

      if (typeof saved.relationship === "string" && saved.relationship.trim().length > 0) {
        const selected = inferRelationshipSelection(saved.relationship.trim(), nextGender);
        setRelationship(selected.key);
        setCustomRelationship(selected.custom);
        setIsRelationshipOpen(false);
      }
      if (saved.personaGender === "male" || saved.personaGender === "female") setIsGenderOpen(false);
    } catch {
      // noop
    }
  }, []);

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

    const finalRelationship =
      relationship === "custom"
        ? customRelationship.trim()
        : relationship
          ? getRelationshipLabel(relationship, userGender).trim()
          : "";

    const nextRelationshipError = finalRelationship.length === 0 ? "관계를 입력해주세요." : "";
    const trimmedName = personaName.trim();
    const nextNameError = trimmedName.length === 0 ? "이름 또는 애칭을 입력해주세요." : "";
    const trimmedNickname = userNickname.trim();
    const nextNicknameError = trimmedNickname.length === 0 ? "나를 불러주던 애칭을 입력해주세요." : "";

    setRelationshipError(nextRelationshipError);
    setNameError(nextNameError);
    setNicknameError(nextNicknameError);
    setSaveError("");

    if (nextRelationshipError || nextNameError || nextNicknameError) {
      if (nextRelationshipError) setIsRelationshipOpen(true);
      return;
    }

    setIsSubmitting(true);

    let finalImageKey = personaImageKey;
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

        const uploadBody = (await uploadResponse.json()) as { key: string; url: string };
        finalImageKey = uploadBody.key;
        finalImageUrl = uploadBody.url;
      } catch (error) {
        setIsSubmitting(false);
        setSaveError(error instanceof Error ? error.message : "이미지 업로드에 실패했습니다.");
        return;
      }
    }

    const payload: StepThreeData = {
      personaImageName: personaImageName || undefined,
      personaImageKey: finalImageKey || undefined,
      personaImageUrl: finalImageUrl || undefined,
      relationship: finalRelationship,
      personaName: trimmedName,
      personaGender,
      userNickname: trimmedNickname,
      personaOccupation: personaOccupation.trim(),
      step: 3,
      updatedAt: new Date().toISOString(),
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    setPersonaImageKey(finalImageKey);
    setPersonaImageUrl(finalImageUrl);

    void persistOnboardingStep(3, payload).catch((error) => {
      console.error("[step-3] remote save failed, continue local flow", error);
    });
    router.push("/step-4");
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#faf9f5] text-[#2f342e]">
      <header className="fixed top-0 z-50 w-full border-b border-[#afb3ac]/25 bg-[#faf9f5]/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-6 md:px-12">
          <div className="font-headline text-2xl font-bold tracking-tight text-[#4a626d]">보고파</div>
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium text-[#655d5a]">Step 3/4</span>
            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-[#edeee8]">
              <div className="h-full w-3/4 bg-[#4a626d] transition-all duration-500" />
            </div>
          </div>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 pb-32 pt-20 md:px-6 md:pb-12 md:pt-24">
        <div className="relative w-full max-w-xl overflow-visible rounded-none bg-transparent p-0 shadow-none md:overflow-hidden md:rounded-[2rem] md:bg-white md:p-12 md:shadow-[0_20px_40px_rgba(47,52,46,0.06)]">
          <div className="absolute -right-10 -top-10 -z-0 hidden h-40 w-40 bg-[#cde6f4]/20 [border-radius:40%_60%_70%_30%/40%_50%_60%_50%] md:block" />

          <div className="relative z-10">
            <div className="mb-8 text-center md:text-left">
              <h1 className="font-headline mb-3 text-3xl font-bold tracking-tight text-[#4a626d] md:text-4xl">
                이제, 다시 대화하고 싶은
                <br />
                사람을 알려주세요.
              </h1>
              <p className="text-[#5d605a]">소중한 기억을 되살리기 위해 대상에 대한 기본 정보가 필요합니다.</p>
            </div>

            <form className="space-y-7" onSubmit={handleSubmit}>
              <div className="flex flex-col items-center justify-center gap-3">
                <label className="group relative block h-28 w-28 cursor-pointer overflow-hidden rounded-full border-4 border-white bg-[#edeee8] shadow-sm md:h-32 md:w-32">
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
                <p className="text-sm font-medium text-[#655d5a]">사진을 등록해주세요 (선택, 10MB 미만 · 자동 압축)</p>
                {personaImageName ? <p className="text-xs text-[#787c75]">{personaImageName}</p> : null}
                {imageError ? <p className="text-xs text-[#9f403d]">{imageError}</p> : null}
              </div>

              <div className="space-y-3">
                <label className="ml-1 block text-sm font-semibold text-[#5c605a]" htmlFor="persona-name">
                  이름 또는 애칭 <span className="text-[#9f403d]">*</span>
                </label>
                <div className="group relative">
                  <input
                    id="persona-name"
                    type="text"
                    value={personaName}
                    onChange={(e) => {
                      const nextValue = e.target.value;
                      setPersonaName(nextValue);
                      if (nameError && nextValue.trim().length > 0) setNameError("");
                    }}
                    placeholder="예: 우리 엄마, 김철수"
                    className={`w-full rounded-xl border-none bg-[#f4f4ef] px-6 py-4 pr-12 text-lg text-[#2f342e] placeholder:text-[#787c75] outline-none ring-0 transition-all duration-300 focus:ring-2 ${
                      nameError ? "focus:ring-[#9f403d]/30" : "focus:ring-[#4a626d]/20"
                    }`}
                  />
                  <div className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-[#787c75] group-focus-within:text-[#4a626d]">
                    <UserIcon />
                  </div>
                </div>
                {nameError ? <p className="ml-1 text-sm text-[#9f403d]">{nameError}</p> : null}
              </div>

              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => setIsRelationshipOpen((prev) => !prev)}
                  className="flex w-full items-center justify-between rounded-xl bg-[#f4f4ef] px-4 py-3 text-left"
                >
                  <span className="text-sm font-semibold text-[#5c605a]">
                    관계 <span className="text-[#9f403d]">*</span>
                  </span>
                  <span className="flex items-center gap-2">
                    {!isRelationshipOpen && relationship ? (
                      <span className="max-w-[160px] truncate text-sm font-medium text-[#4a626d]">
                        {relationship === "custom"
                          ? customRelationship.trim() || "직접 입력"
                          : getRelationshipLabel(relationship, userGender)}
                      </span>
                    ) : null}
                    <span className={`text-sm text-[#4a626d] transition-transform duration-300 ${isRelationshipOpen ? "rotate-180" : ""}`}>
                      ▾
                    </span>
                  </span>
                </button>

                <div
                  className={`grid transition-all duration-300 ease-out ${
                    isRelationshipOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-70"
                  }`}
                >
                  <div className="overflow-hidden">
                    <div className="grid grid-cols-2 gap-3 pt-1 sm:grid-cols-3">
                      {RELATIONSHIP_KEYS.map((item) => {
                        const isActive = relationship === item;
                        return (
                          <button
                            key={item}
                            type="button"
                            onClick={() => {
                              setRelationship(item);
                              if (item !== "custom") setCustomRelationship("");
                              const inferred = inferGenderByRelationshipKey(item, userGender);
                              if (inferred) setPersonaGender(inferred);
                              setIsGenderOpen(item === "youngerSibling" || item === "custom");
                              if (relationshipError) setRelationshipError("");
                              setIsRelationshipOpen(false);
                            }}
                            className={`rounded-2xl border-2 px-4 py-3 text-sm font-semibold transition-all duration-300 hover:-translate-y-0.5 md:text-base ${
                              isActive
                                ? "border-[#4a626d] bg-white text-[#2f342e] shadow-sm"
                                : "border-transparent bg-[#f4f4ef] text-[#2f342e] hover:bg-white"
                            }`}
                          >
                            {getRelationshipLabel(item, userGender)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {relationship === "custom" ? (
                  <input
                    type="text"
                    value={customRelationship}
                    onChange={(e) => {
                      const nextValue = e.target.value;
                      setCustomRelationship(nextValue);
                      if (relationshipError && nextValue.trim().length > 0) setRelationshipError("");
                    }}
                    placeholder="관계를 입력하세요"
                    className="w-full rounded-xl border-none bg-[#f4f4ef] px-4 py-3 text-[#2f342e] outline-none ring-0 transition-all focus:ring-2 focus:ring-[#4a626d]/20"
                  />
                ) : null}
                {relationshipError ? <p className="ml-1 text-sm text-[#9f403d]">{relationshipError}</p> : null}
              </div>

              {shouldShowGenderSelector ? (
                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={() => setIsGenderOpen((prev) => !prev)}
                    className="flex w-full items-center justify-between rounded-xl bg-[#f4f4ef] px-4 py-3 text-left"
                  >
                    <span className="text-sm font-semibold text-[#5c605a]">성별</span>
                    <span className="flex items-center gap-2">
                      {!isGenderOpen ? (
                        <span className="text-sm font-medium text-[#4a626d]">{personaGender === "male" ? "남성" : "여성"}</span>
                      ) : null}
                      <span className={`text-sm text-[#4a626d] transition-transform duration-300 ${isGenderOpen ? "rotate-180" : ""}`}>
                        ▾
                      </span>
                    </span>
                  </button>

                  <div
                    className={`grid transition-all duration-300 ease-out ${
                      isGenderOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-70"
                    }`}
                  >
                    <div className="overflow-hidden">
                      <div className="grid grid-cols-2 gap-3 pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            setPersonaGender("male");
                            setIsGenderOpen(false);
                          }}
                          className={`rounded-2xl border-2 px-4 py-3 text-sm font-semibold transition-all duration-300 md:text-base ${
                            personaGender === "male"
                              ? "border-[#4a626d] bg-white text-[#2f342e] shadow-sm"
                              : "border-transparent bg-[#f4f4ef] text-[#2f342e] hover:bg-white"
                          }`}
                        >
                          남성
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setPersonaGender("female");
                            setIsGenderOpen(false);
                          }}
                          className={`rounded-2xl border-2 px-4 py-3 text-sm font-semibold transition-all duration-300 md:text-base ${
                            personaGender === "female"
                              ? "border-[#4a626d] bg-white text-[#2f342e] shadow-sm"
                              : "border-transparent bg-[#f4f4ef] text-[#2f342e] hover:bg-white"
                          }`}
                        >
                          여성
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="space-y-3">
                <label className="ml-1 block text-sm font-semibold text-[#5c605a]" htmlFor="persona-occupation">
                  직업
                </label>
                <input
                  id="persona-occupation"
                  type="text"
                  value={personaOccupation}
                  onChange={(e) => setPersonaOccupation(e.target.value)}
                  placeholder={getOccupationPlaceholder(relationship, personaGender, userGender)}
                  className="w-full rounded-xl border-none bg-[#f4f4ef] px-4 py-4 text-[#2f342e] placeholder:text-[#787c75] outline-none ring-0 transition-all focus:ring-2 focus:ring-[#4a626d]/20"
                />
              </div>

              <div className="space-y-3">
                <div className="ml-1 flex items-center justify-between">
                  <label className="block text-sm font-semibold text-[#5c605a]" htmlFor="persona-user-nickname">
                    나를 불러주던 애칭 <span className="text-[#9f403d]">*</span>
                  </label>
                </div>
                <input
                  id="persona-user-nickname"
                  type="text"
                  value={userNickname}
                  onChange={(e) => {
                    const nextValue = e.target.value;
                    setUserNickname(nextValue);
                    if (nicknameError && nextValue.trim().length > 0) setNicknameError("");
                  }}
                  placeholder={getNicknamePlaceholder(relationship, userGender)}
                  required
                  className={`w-full rounded-xl border-none bg-[#f4f4ef] px-4 py-4 text-[#2f342e] placeholder:text-[#787c75] outline-none ring-0 transition-all focus:ring-2 ${
                    nicknameError ? "focus:ring-[#9f403d]/30" : "focus:ring-[#4a626d]/20"
                  }`}
                />
                {nicknameError ? <p className="ml-1 text-sm text-[#9f403d]">{nicknameError}</p> : null}
              </div>

              <div className="pt-0 md:pt-2">
                <div className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] left-4 right-4 z-[60] grid grid-cols-2 gap-2 md:static md:left-auto md:right-auto md:z-auto md:gap-4">
                  <Link
                    href="/step-2"
                    className="inline-flex items-center justify-center gap-2 rounded-full border border-[#4a626d] bg-white px-4 py-4 text-base font-semibold text-[#4a626d] shadow-[0_12px_30px_rgba(47,52,46,0.16)] transition-all duration-300 hover:bg-[#cde6f4]/25 active:scale-[0.98] md:rounded-2xl md:text-lg md:font-bold md:shadow-none"
                  >
                    <ArrowLeftIcon />
                    이전
                  </Link>

                  <button
                    type="submit"
                    disabled={isSubmitting}
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
                {saveError ? <p className="mt-3 text-center text-sm text-[#9f403d]">{saveError}</p> : null}
              </div>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}
