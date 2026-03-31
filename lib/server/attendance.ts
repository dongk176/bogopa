import { ATTENDANCE_MAX_DAY, ATTENDANCE_REWARDS, getAttendanceRewardByDay } from "@/lib/attendance/config";
import { getDbPool } from "@/lib/server/db";
import { ensureMemoryPassTables } from "@/lib/server/memory-pass";

const CREATE_ATTENDANCE_TABLES_SQL = `
CREATE SCHEMA IF NOT EXISTS bogopa;

CREATE TABLE IF NOT EXISTS bogopa.user_attendance_states (
  user_id VARCHAR PRIMARY KEY,
  streak_day INT NOT NULL DEFAULT 0,
  last_check_date_kst DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (streak_day >= 0)
);

CREATE TABLE IF NOT EXISTS bogopa.user_attendance_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id VARCHAR NOT NULL,
  check_date_kst DATE NOT NULL,
  day_in_cycle INT NOT NULL CHECK (day_in_cycle BETWEEN 1 AND ${ATTENDANCE_MAX_DAY}),
  reward_memory INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, check_date_kst)
);

CREATE INDEX IF NOT EXISTS idx_user_attendance_logs_user_created
  ON bogopa.user_attendance_logs (user_id, created_at DESC);
`;

let ensureAttendancePromise: Promise<void> | null = null;

function dateToKey(value: unknown) {
  if (typeof value === "string") return value.slice(0, 10);
  return "";
}

function toUtcDateMs(dateKey: string) {
  const [yearRaw, monthRaw, dayRaw] = dateKey.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return NaN;
  return Date.UTC(year, month - 1, day);
}

function isPreviousDay(lastDateKey: string, todayKey: string) {
  const lastMs = toUtcDateMs(lastDateKey);
  const todayMs = toUtcDateMs(todayKey);
  if (!Number.isFinite(lastMs) || !Number.isFinite(todayMs)) return false;
  return todayMs - lastMs === 86_400_000;
}

function getNextStreakDay(previousStreakDay: number, previousDateKey: string, todayKey: string) {
  if (!previousDateKey) return 1;
  if (!isPreviousDay(previousDateKey, todayKey)) return 1;
  if (previousStreakDay >= ATTENDANCE_MAX_DAY) return 1;
  return Math.max(previousStreakDay + 1, 1);
}

function getDisplayStreakDay(streakDay: number, lastDateKey: string, todayKey: string) {
  if (!lastDateKey) return 0;
  if (lastDateKey === todayKey) return streakDay;
  if (isPreviousDay(lastDateKey, todayKey)) return streakDay;
  return 0;
}

export type AttendanceStatus = {
  streakDay: number;
  checkedToday: boolean;
  todayKst: string;
  nextReward: number;
  nextDay: number;
  rewards: ReadonlyArray<(typeof ATTENDANCE_REWARDS)[number]>;
};

export type AttendanceCheckInResult = AttendanceStatus & {
  rewardGranted: number;
  memoryBalance: number;
  alreadyCheckedToday: boolean;
  checkedDay: number;
};

export async function ensureAttendanceTables() {
  if (!ensureAttendancePromise) {
    ensureAttendancePromise = (async () => {
      const pool = getDbPool();
      await pool.query(CREATE_ATTENDANCE_TABLES_SQL);
    })().catch((error) => {
      ensureAttendancePromise = null;
      throw error;
    });
  }

  return ensureAttendancePromise;
}

async function getTodayKstDateKey() {
  const pool = getDbPool();
  const todayRes = await pool.query(
    `SELECT TO_CHAR((NOW() AT TIME ZONE 'Asia/Seoul')::date, 'YYYY-MM-DD') AS today_kst`,
  );
  return String(todayRes.rows[0]?.today_kst || "");
}

export async function getAttendanceStatus(userId: string): Promise<AttendanceStatus> {
  await ensureAttendanceTables();

  const pool = getDbPool();
  const todayKst = await getTodayKstDateKey();

  await pool.query(
    `
    INSERT INTO bogopa.user_attendance_states (user_id)
    VALUES ($1)
    ON CONFLICT (user_id) DO NOTHING
    `,
    [userId],
  );

  const stateRes = await pool.query(
    `
    SELECT streak_day, TO_CHAR(last_check_date_kst, 'YYYY-MM-DD') AS last_check_date_kst
    FROM bogopa.user_attendance_states
    WHERE user_id = $1
    `,
    [userId],
  );

  const state = stateRes.rows[0] || {};
  const rawStreak = Number(state.streak_day || 0);
  const lastDateKey = dateToKey(state.last_check_date_kst);
  const checkedToday = lastDateKey === todayKst;
  const streakDay = getDisplayStreakDay(rawStreak, lastDateKey, todayKst);
  const normalizedNextDay = checkedToday
    ? (streakDay >= ATTENDANCE_MAX_DAY ? 1 : streakDay + 1)
    : getNextStreakDay(streakDay, lastDateKey, todayKst);

  return {
    streakDay,
    checkedToday,
    todayKst,
    nextDay: normalizedNextDay,
    nextReward: getAttendanceRewardByDay(normalizedNextDay),
    rewards: ATTENDANCE_REWARDS,
  };
}

export async function checkInAttendance(userId: string): Promise<AttendanceCheckInResult> {
  await ensureAttendanceTables();
  await ensureMemoryPassTables();

  const pool = getDbPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const todayRes = await client.query(
      `SELECT TO_CHAR((NOW() AT TIME ZONE 'Asia/Seoul')::date, 'YYYY-MM-DD') AS today_kst`,
    );
    const todayKst = String(todayRes.rows[0]?.today_kst || "");

    await client.query(
      `
      INSERT INTO bogopa.user_attendance_states (user_id)
      VALUES ($1)
      ON CONFLICT (user_id) DO NOTHING
      `,
      [userId],
    );

    const stateRes = await client.query(
      `
      SELECT streak_day, TO_CHAR(last_check_date_kst, 'YYYY-MM-DD') AS last_check_date_kst
      FROM bogopa.user_attendance_states
      WHERE user_id = $1
      FOR UPDATE
      `,
      [userId],
    );

    const state = stateRes.rows[0] || {};
    const previousStreakDay = Number(state.streak_day || 0);
    const previousDateKey = dateToKey(state.last_check_date_kst);
    const alreadyCheckedToday = previousDateKey === todayKst;

    if (alreadyCheckedToday) {
      const entRes = await client.query(
        `
        INSERT INTO bogopa.user_entitlements (user_id)
        VALUES ($1)
        ON CONFLICT (user_id) DO NOTHING
        `,
        [userId],
      );
      void entRes;

      const balanceRes = await client.query(
        `SELECT memory_balance FROM bogopa.user_entitlements WHERE user_id = $1`,
        [userId],
      );
      const memoryBalance = Number(balanceRes.rows[0]?.memory_balance || 0);
      const nextDay = previousStreakDay >= ATTENDANCE_MAX_DAY ? 1 : previousStreakDay + 1;

      await client.query("COMMIT");
      return {
        streakDay: previousStreakDay,
        checkedToday: true,
        todayKst,
        nextDay,
        nextReward: getAttendanceRewardByDay(nextDay),
        rewards: ATTENDANCE_REWARDS,
        rewardGranted: 0,
        memoryBalance,
        alreadyCheckedToday: true,
        checkedDay: previousStreakDay,
      };
    }

    const checkedDay = getNextStreakDay(previousStreakDay, previousDateKey, todayKst);
    const rewardGranted = getAttendanceRewardByDay(checkedDay);

    await client.query(
      `
      UPDATE bogopa.user_attendance_states
      SET streak_day = $2, last_check_date_kst = $3::date, updated_at = NOW()
      WHERE user_id = $1
      `,
      [userId, checkedDay, todayKst],
    );

    await client.query(
      `
      INSERT INTO bogopa.user_attendance_logs (user_id, check_date_kst, day_in_cycle, reward_memory)
      VALUES ($1, $2::date, $3, $4)
      ON CONFLICT (user_id, check_date_kst) DO NOTHING
      `,
      [userId, todayKst, checkedDay, rewardGranted],
    );

    await client.query(
      `
      INSERT INTO bogopa.user_entitlements (user_id)
      VALUES ($1)
      ON CONFLICT (user_id) DO NOTHING
      `,
      [userId],
    );

    const balanceRes = await client.query(
      `
      UPDATE bogopa.user_entitlements
      SET memory_balance = memory_balance + $2, updated_at = NOW()
      WHERE user_id = $1
      RETURNING memory_balance
      `,
      [userId, rewardGranted],
    );

    const memoryBalance = Number(balanceRes.rows[0]?.memory_balance || 0);
    const nextDay = checkedDay >= ATTENDANCE_MAX_DAY ? 1 : checkedDay + 1;

    await client.query("COMMIT");
    return {
      streakDay: checkedDay,
      checkedToday: true,
      todayKst,
      nextDay,
      nextReward: getAttendanceRewardByDay(nextDay),
      rewards: ATTENDANCE_REWARDS,
      rewardGranted,
      memoryBalance,
      alreadyCheckedToday: false,
      checkedDay,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
