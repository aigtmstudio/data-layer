export interface TimelinessBand {
  label: string;
  maxAgeDays: number;
  multiplier: number;
}

export const TIMELINESS_BANDS: TimelinessBand[] = [
  { label: 'excellent', maxAgeDays: 30, multiplier: 1.0 },
  { label: 'strong', maxAgeDays: 90, multiplier: 0.85 },
  { label: 'ok', maxAgeDays: 180, multiplier: 0.6 },
  { label: 'weak', maxAgeDays: 365, multiplier: 0.3 },
];

export const UNKNOWN_DATE_MULTIPLIER = 0.4;

export function computeTimelinessMultiplier(
  eventDate: Date | string | null | undefined,
  referenceDate?: Date,
): { multiplier: number; band: string; ageDays: number | null } {
  if (!eventDate) {
    return { multiplier: UNKNOWN_DATE_MULTIPLIER, band: 'unknown', ageDays: null };
  }

  const ref = referenceDate ?? new Date();
  const event = typeof eventDate === 'string' ? new Date(eventDate) : eventDate;
  const ageDays = Math.floor((ref.getTime() - event.getTime()) / (1000 * 60 * 60 * 24));

  if (ageDays < 0) {
    return { multiplier: 1.0, band: 'excellent', ageDays: 0 };
  }

  for (const band of TIMELINESS_BANDS) {
    if (ageDays <= band.maxAgeDays) {
      return { multiplier: band.multiplier, band: band.label, ageDays };
    }
  }

  return { multiplier: 0.0, band: 'expired', ageDays };
}

export function applyTimeliness(
  baseStrength: number,
  eventDate: Date | string | null | undefined,
): number {
  const { multiplier } = computeTimelinessMultiplier(eventDate);
  return Math.round(baseStrength * multiplier * 100) / 100;
}
