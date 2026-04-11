import { getDbPool } from "@/lib/server/db";
import { ensureChatTables } from "@/lib/server/chat-db";
import { getOrCreateMemoryPassStatus } from "@/lib/server/memory-pass";

export type PersonaLockRow = {
  personaId: string;
  createdAt?: string | Date | null;
  updatedAt?: string | Date | null;
};

export type PersonaLockStatus = {
  isSubscribed: boolean;
  isLockModeActive: boolean;
  primaryPersonaId: string | null;
  lockedPersonaIds: string[];
};

function toEpochMs(value: string | Date | null | undefined) {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

export function buildPersonaLockStatusFromRows(input: {
  isSubscribed: boolean;
  rows: PersonaLockRow[];
}): PersonaLockStatus {
  const { isSubscribed } = input;
  const rows = [...input.rows].filter((row) => String(row.personaId || "").trim().length > 0);

  if (isSubscribed || rows.length <= 1) {
    return {
      isSubscribed,
      isLockModeActive: false,
      primaryPersonaId: rows[0]?.personaId || null,
      lockedPersonaIds: [],
    };
  }

  rows.sort((a, b) => {
    const createdDiff = toEpochMs(a.createdAt) - toEpochMs(b.createdAt);
    if (createdDiff !== 0) return createdDiff;
    const updatedDiff = toEpochMs(a.updatedAt) - toEpochMs(b.updatedAt);
    if (updatedDiff !== 0) return updatedDiff;
    return String(a.personaId).localeCompare(String(b.personaId));
  });

  const primaryPersonaId = rows[0]?.personaId || null;
  const lockedPersonaIds = rows
    .slice(1)
    .map((row) => row.personaId)
    .filter(Boolean);

  return {
    isSubscribed,
    isLockModeActive: lockedPersonaIds.length > 0,
    primaryPersonaId,
    lockedPersonaIds,
  };
}

export async function getPersonaLockStatus(
  userId: string,
  options?: { isSubscribed?: boolean },
): Promise<PersonaLockStatus> {
  await ensureChatTables();
  const pool = getDbPool();

  const isSubscribed =
    typeof options?.isSubscribed === "boolean"
      ? options.isSubscribed
      : (await getOrCreateMemoryPassStatus(userId)).isSubscribed;

  const personaRes = await pool.query(
    `
    SELECT persona_id, created_at, updated_at
    FROM bogopa.personas
    WHERE user_id = $1
    `,
    [userId],
  );

  return buildPersonaLockStatusFromRows({
    isSubscribed,
    rows: personaRes.rows.map((row) => ({
      personaId: String(row.persona_id || "").trim(),
      createdAt: row.created_at as string | Date | null | undefined,
      updatedAt: row.updated_at as string | Date | null | undefined,
    })),
  });
}

