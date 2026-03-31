export const ATTENDANCE_REWARDS = [
  { day: 1, reward: 50 },
  { day: 2, reward: 60 },
  { day: 3, reward: 70 },
  { day: 4, reward: 80 },
  { day: 5, reward: 90 },
  { day: 6, reward: 100 },
  { day: 7, reward: 150 },
  { day: 8, reward: 200 },
  { day: 9, reward: 350 },
  { day: 10, reward: 300 },
] as const;

export const ATTENDANCE_MAX_DAY = 10;

export function getAttendanceRewardByDay(day: number) {
  const normalizedDay = Math.min(Math.max(day, 1), ATTENDANCE_MAX_DAY);
  return ATTENDANCE_REWARDS[normalizedDay - 1]?.reward ?? ATTENDANCE_REWARDS[0].reward;
}
