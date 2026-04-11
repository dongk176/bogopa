import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { savePersonaToDb, getPersonasForUser, getPersonaById, countPersonasForUser } from "@/lib/server/chat-db";
import { PersonaRuntime } from "@/types/persona";
import { MEMORY_COSTS } from "@/lib/memory-pass/config";
import { consumeMemory, getOrCreateMemoryPassStatus } from "@/lib/server/memory-pass";
import { inferAvatarStorage, resolveAvatarUrlFromStorage } from "@/lib/avatar-storage";
import { logAnalyticsEventSafe } from "@/lib/server/analytics";
import { buildPersonaLockStatusFromRows, getPersonaLockStatus } from "@/lib/server/persona-lock";

function trimList(values: string[] | undefined, maxCount: number, maxChars: number) {
    return (values || [])
        .map((item) => item.trim())
        .filter(Boolean)
        .map((item) => item.slice(0, maxChars))
        .slice(0, maxCount);
}

function applyRuntimePlanLimits(runtime: PersonaRuntime, options: {
    maxMemoryCount: number;
    maxMemoryChars: number;
    maxPhraseCount: number;
    maxPhraseChars: number;
}) {
    return {
        ...runtime,
        summary: "",
        memories: trimList(runtime.memories, options.maxMemoryCount, options.maxMemoryChars),
        expressions: {
            ...runtime.expressions,
            frequentPhrases: trimList(runtime.expressions?.frequentPhrases, options.maxPhraseCount, options.maxPhraseChars),
        },
    } as PersonaRuntime;
}

function normalizeLegacyAvatarUrl(avatarUrl: string | null | undefined) {
    if (!avatarUrl) return avatarUrl;
    if (!avatarUrl.startsWith("/img/")) return avatarUrl;

    const legacyNameRaw = avatarUrl.replace(/^\/img\//, "");
    const legacyName = decodeURIComponent(legacyNameRaw).replace(/\.[a-z0-9]+$/i, "").trim().toLowerCase();
    const legacyMap: Record<string, string> = {
        "dad": "/profile/dad.webp",
        "mom": "/profile/mom.webp",
        "husband": "/profile/husband.webp",
        "wife": "/profile/wife.webp",
        "old brother": "/profile/old brother.webp",
        "old sister": "/profile/old sister.webp",
        "young brother": "/profile/young brother.webp",
        "young sister": "/profile/young sister.webp",
    };

    return legacyMap[legacyName] ?? "/profile/mom.webp";
}

function normalizePersonaAvatar(input: {
    avatarSource?: string | null;
    avatarKey?: string | null;
    avatarUrl?: string | null;
}) {
    const inferred = inferAvatarStorage(input);
    return {
        avatarSource: inferred.avatarSource,
        avatarKey: inferred.avatarKey,
        avatarUrl: inferred.avatarUrl ? normalizeLegacyAvatarUrl(inferred.avatarUrl) : null,
    };
}

function countNonEmptyStrings(values: unknown) {
    if (!Array.isArray(values)) return 0;
    return values
        .map((value) => (typeof value === "string" ? value.trim() : ""))
        .filter(Boolean).length;
}

function getProfileFieldCount(runtime: PersonaRuntime | null | undefined) {
    const profile = runtime?.userProfile;
    if (!profile) return 0;
    const hasAge = typeof profile.age === "number" && Number.isFinite(profile.age);
    const hasMbti = typeof profile.mbti === "string" && profile.mbti.trim().length > 0;
    const hasInterests = Array.isArray(profile.interests) && profile.interests.some((item) => typeof item === "string" && item.trim().length > 0);
    return [hasAge, hasMbti, hasInterests].filter(Boolean).length;
}

function buildPersonaAnalyticsProperties(runtime: PersonaRuntime, avatarSource: string | null, prevMemoryCount = 0) {
    const memoryCount = countNonEmptyStrings(runtime.memories);
    const frequentPhrasesCount = countNonEmptyStrings(runtime.expressions?.frequentPhrases);
    const profileFieldCount = getProfileFieldCount(runtime);
    return {
        relation: runtime.relation || "",
        goal: runtime.goal || "",
        memoryCount,
        prevMemoryCount: Math.max(0, prevMemoryCount),
        addedMemoryCount: Math.max(0, memoryCount - Math.max(0, prevMemoryCount)),
        frequentPhrasesCount,
        profileFieldCount,
        hasAvatar: Boolean(avatarSource && avatarSource !== "default"),
    };
}

export async function POST(request: NextRequest) {
    const session = await getServerSession(authOptions);
    const sessionUser = session?.user as any;
    if (!sessionUser?.id) {
        return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    try {
        const body = await request.json();
        const runtime = body.runtime as PersonaRuntime;
        const avatarUrl = body.avatarUrl as string | null;
        const avatarSource = body.avatarSource as string | null;
        const avatarKey = body.avatarKey as string | null;

        if (!runtime || !runtime.personaId) {
            return NextResponse.json({ error: "유효하지 않은 데이터입니다." }, { status: 400 });
        }

        const memoryPass = await getOrCreateMemoryPassStatus(sessionUser.id);
        const existing = await getPersonaById(runtime.personaId, sessionUser.id);
        const isCreate = !existing;

        if (isCreate) {
            const personaCount = await countPersonasForUser(sessionUser.id);
            if (personaCount >= memoryPass.limits.maxPersonas) {
                return NextResponse.json(
                    { error: "생성 가능한 페르소나 수를 초과했습니다.", code: "PERSONA_LIMIT_REACHED", maxPersonas: memoryPass.limits.maxPersonas },
                    { status: 403 },
                );
            }

            const consumed = await consumeMemory(sessionUser.id, MEMORY_COSTS.personaCreate, {
                reason: "persona_create",
                detail: {
                    personaId: runtime.personaId,
                    personaName: runtime.displayName || "",
                },
            });
            if (!consumed.ok) {
                return NextResponse.json(
                    {
                        error: "기억이 부족합니다.",
                        code: "MEMORY_INSUFFICIENT",
                        required: MEMORY_COSTS.personaCreate,
                        balance: consumed.balance,
                    },
                    { status: 402 },
                );
            }
        }

        const limitedRuntime = applyRuntimePlanLimits(runtime, {
            maxMemoryCount: memoryPass.limits.memoryItemMaxCount,
            maxMemoryChars: memoryPass.limits.memoryItemCharMax,
            maxPhraseCount: memoryPass.limits.phraseItemMaxCount,
            maxPhraseChars: memoryPass.limits.phraseItemCharMax,
        });
        const resolvedAvatar = normalizePersonaAvatar({
            avatarSource,
            avatarKey,
            avatarUrl: avatarUrl || (limitedRuntime as any)?.avatarUrl || null,
        });

        const runtimeWithAvatar = {
            ...(limitedRuntime as any),
            avatarUrl: resolvedAvatar.avatarUrl || "",
            avatarSource: resolvedAvatar.avatarSource,
            avatarKey: resolvedAvatar.avatarKey,
        } as PersonaRuntime;

        const name = runtimeWithAvatar.displayName || "알 수 없음";

        await savePersonaToDb(
            sessionUser.id,
            runtimeWithAvatar.personaId,
            name,
            {
                avatarSource: resolvedAvatar.avatarSource,
                avatarKey: resolvedAvatar.avatarKey,
                avatarUrl: resolvedAvatar.avatarUrl,
            },
            {},
            runtimeWithAvatar,
        );

        const previousRuntime = existing?.runtime as PersonaRuntime | undefined;
        const previousMemoryCount = countNonEmptyStrings(previousRuntime?.memories);
        const analyticsProperties = buildPersonaAnalyticsProperties(
            runtimeWithAvatar,
            resolvedAvatar.avatarSource,
            previousMemoryCount,
        );
        await logAnalyticsEventSafe({
            userId: sessionUser.id,
            eventName: isCreate ? "persona_created" : "persona_edited",
            personaId: runtimeWithAvatar.personaId,
            properties: analyticsProperties,
        });
        if (analyticsProperties.memoryCount > previousMemoryCount) {
            await logAnalyticsEventSafe({
                userId: sessionUser.id,
                eventName: "memory_added",
                personaId: runtimeWithAvatar.personaId,
                properties: {
                    addedCount: analyticsProperties.addedMemoryCount,
                    totalMemoryCount: analyticsProperties.memoryCount,
                },
            });
        }

        const nextMemoryPass = await getOrCreateMemoryPassStatus(sessionUser.id);
        return NextResponse.json({ ok: true, memoryBalance: nextMemoryPass.memoryBalance });
    } catch (error) {
        console.error("[api-persona] failed to save persona", error);
        return NextResponse.json({ error: "페르소나 저장에 실패했습니다." }, { status: 500 });
    }
}

export async function GET(request: NextRequest) {
    const session = await getServerSession(authOptions);
    const sessionUser = session?.user as any;
    if (!sessionUser?.id) {
        return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    try {
        const personas = await getPersonasForUser(sessionUser.id);
        const memoryPass = await getOrCreateMemoryPassStatus(sessionUser.id);
        const lockStatus = buildPersonaLockStatusFromRows({
            isSubscribed: memoryPass.isSubscribed,
            rows: personas.map((persona: any) => ({
                personaId: String(persona.persona_id || "").trim(),
                createdAt: persona.created_at,
                updatedAt: persona.updated_at,
            })),
        });

        const normalizedPersonas = personas.map((persona: any) => {
            const inferredPersonaAvatar = inferAvatarStorage({
                avatarSource: persona.avatar_source,
                avatarKey: persona.avatar_key,
                avatarUrl: normalizeLegacyAvatarUrl(persona.avatar_url),
            });
            const normalizedAvatarUrl = resolveAvatarUrlFromStorage({
                avatarSource: inferredPersonaAvatar.avatarSource,
                avatarKey: inferredPersonaAvatar.avatarKey,
                legacyAvatarUrl: normalizeLegacyAvatarUrl(persona.avatar_url),
            });
            const runtime = persona.runtime ? { ...persona.runtime } : null;
            if (runtime) {
                const inferredRuntimeAvatar = inferAvatarStorage({
                    avatarSource: runtime.avatarSource,
                    avatarKey: runtime.avatarKey,
                    avatarUrl: runtime.avatarUrl || normalizedAvatarUrl || null,
                });
                runtime.avatarSource = inferredRuntimeAvatar.avatarSource;
                runtime.avatarKey = inferredRuntimeAvatar.avatarKey;
                runtime.avatarUrl = resolveAvatarUrlFromStorage({
                    avatarSource: inferredRuntimeAvatar.avatarSource,
                    avatarKey: inferredRuntimeAvatar.avatarKey,
                    legacyAvatarUrl: inferredRuntimeAvatar.avatarUrl,
                });
                if (typeof runtime.personaImageUrl === "string") {
                    runtime.personaImageUrl = normalizeLegacyAvatarUrl(runtime.personaImageUrl);
                }
            }

            return {
                ...persona,
                avatar_url: normalizedAvatarUrl,
                avatar_source: inferredPersonaAvatar.avatarSource,
                avatar_key: inferredPersonaAvatar.avatarKey,
                runtime,
                is_locked: lockStatus.lockedPersonaIds.includes(String(persona.persona_id || "").trim()),
                is_primary_unlocked: lockStatus.primaryPersonaId === String(persona.persona_id || "").trim(),
            };
        });

        return NextResponse.json({
            ok: true,
            personas: normalizedPersonas,
            lock: {
                isLockModeActive: lockStatus.isLockModeActive,
                primaryPersonaId: lockStatus.primaryPersonaId,
                lockedPersonaIds: lockStatus.lockedPersonaIds,
            },
        });
    } catch (error) {
        console.error("[api-persona] failed to fetch personas", error);
        return NextResponse.json({ error: "페르소나 목록을 불러오지 못했습니다." }, { status: 500 });
    }
}
export async function DELETE(_request: NextRequest) {
    const session = await getServerSession(authOptions);
    const sessionUser = session?.user as any;
    if (!sessionUser?.id) {
        return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    return NextResponse.json(
        {
            error: "내 기억 삭제는 지원하지 않습니다. 데이터 삭제는 계정 탈퇴를 통해서만 가능합니다.",
            code: "DELETION_REQUIRES_ACCOUNT_WITHDRAWAL",
        },
        { status: 403 },
    );
}

export async function PATCH(request: NextRequest) {
    const session = await getServerSession(authOptions);
    const sessionUser = session?.user as any;
    if (!sessionUser?.id) {
        return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    try {
        const body = await request.json();
        const { personaId, name, avatarUrl, avatarSource, avatarKey } = body;
        const runtime = body.runtime as PersonaRuntime | undefined;

        if (!personaId || !runtime?.personaId) {
            return NextResponse.json({ error: "personaId가 필요합니다." }, { status: 400 });
        }

        const memoryPass = await getOrCreateMemoryPassStatus(sessionUser.id);
        const existing = await getPersonaById(personaId, sessionUser.id);
        if (!existing) {
            return NextResponse.json({ error: "존재하지 않는 페르소나입니다." }, { status: 404 });
        }
        const lockStatus = await getPersonaLockStatus(sessionUser.id, { isSubscribed: memoryPass.isSubscribed });
        if (lockStatus.lockedPersonaIds.includes(String(personaId).trim())) {
            return NextResponse.json(
                {
                    error: "기억 패스가 만료되어 이 기억은 잠금 상태입니다. 구독 후 다시 수정할 수 있어요.",
                    code: "MEMORY_PASS_EXPIRED_LOCKED_PERSONA",
                    requiresSubscription: true,
                    primaryPersonaId: lockStatus.primaryPersonaId,
                },
                { status: 403 },
            );
        }

        const limitedRuntime = applyRuntimePlanLimits(runtime, {
            maxMemoryCount: memoryPass.limits.memoryItemMaxCount,
            maxMemoryChars: memoryPass.limits.memoryItemCharMax,
            maxPhraseCount: memoryPass.limits.phraseItemMaxCount,
            maxPhraseChars: memoryPass.limits.phraseItemCharMax,
        });
        const resolvedAvatar = normalizePersonaAvatar({
            avatarSource,
            avatarKey,
            avatarUrl: avatarUrl || (limitedRuntime as any)?.avatarUrl || null,
        });
        const runtimeWithAvatar = {
            ...(limitedRuntime as any),
            avatarUrl: resolvedAvatar.avatarUrl || "",
            avatarSource: resolvedAvatar.avatarSource,
            avatarKey: resolvedAvatar.avatarKey,
        } as PersonaRuntime;

        const resolvedName = runtimeWithAvatar.displayName || name || "알 수 없음";
        await savePersonaToDb(
            sessionUser.id,
            personaId,
            resolvedName,
            {
                avatarSource: resolvedAvatar.avatarSource,
                avatarKey: resolvedAvatar.avatarKey,
                avatarUrl: resolvedAvatar.avatarUrl,
            },
            {},
            runtimeWithAvatar,
        );

        const previousRuntime = existing.runtime as PersonaRuntime | undefined;
        const previousMemoryCount = countNonEmptyStrings(previousRuntime?.memories);
        const analyticsProperties = buildPersonaAnalyticsProperties(
            runtimeWithAvatar,
            resolvedAvatar.avatarSource,
            previousMemoryCount,
        );
        await logAnalyticsEventSafe({
            userId: sessionUser.id,
            eventName: "persona_edited",
            personaId,
            properties: analyticsProperties,
        });
        if (analyticsProperties.memoryCount > previousMemoryCount) {
            await logAnalyticsEventSafe({
                userId: sessionUser.id,
                eventName: "memory_added",
                personaId,
                properties: {
                    addedCount: analyticsProperties.addedMemoryCount,
                    totalMemoryCount: analyticsProperties.memoryCount,
                },
            });
        }
        return NextResponse.json({ ok: true });
    } catch (error) {
        console.error("[api-persona] failed to update persona", error);
        return NextResponse.json({ error: "페르소나 수정에 실패했습니다." }, { status: 500 });
    }
}
