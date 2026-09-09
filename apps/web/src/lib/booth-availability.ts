import type { Booth } from '@indiafoss/model';

export function boothAvailableOn(booth: Booth, day: string): boolean {
  return booth.availableDates === undefined || booth.availableDates.includes(day);
}
