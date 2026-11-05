import { STUDIO_INFO } from '../constants/studio';
import type { Registration } from '../types';

export interface FormatCurrencyOptions {
  exact?: boolean;
}

/**
 * Formats a numeric amount into Philippine Peso currency string (`₱1,500`).
 * If the amount is >= 10,000 (10K+ / 100K+ / 1M+), it displays in abbreviated notation (`₱10K`, `₱100K`, `₱1.5M`),
 * unless `{ exact: true }` is specified for official receipts and contracts.
 */
export function formatCurrency(
  amount: number | undefined | null,
  options: FormatCurrencyOptions = {}
): string {
  const val = Number(amount || 0);

  if (options.exact) {
    return `₱${val.toLocaleString()}`;
  }

  const absVal = Math.abs(val);
  const sign = val < 0 ? '-' : '';

  if (absVal >= 1_000_000_000) {
    const formatted = (absVal / 1_000_000_000).toFixed(1).replace(/\.0$/, '');
    return `${sign}₱${formatted}B`;
  }
  if (absVal >= 1_000_000) {
    const formatted = (absVal / 1_000_000).toFixed(1).replace(/\.0$/, '');
    return `${sign}₱${formatted}M`;
  }
  if (absVal >= 10_000) {
    const formatted = (absVal / 1_000).toFixed(1).replace(/\.0$/, '');
    return `${sign}₱${formatted}K`;
  }

  return `₱${val.toLocaleString()}`;
}

/**
 * Formats a daily queue number into a 3-digit zero-padded string (`#001`).
 */
export function formatQueueNumber(queueNumber: number | undefined | null, fallback = 1): string {
  return `#${String(queueNumber || fallback).padStart(3, '0')}`;
}

/**
 * Formats a job order number with the classic receipt prefix (`№ 00001`).
 */
export function formatJobOrderNo(jobOrderNo?: string | null): string {
  if (!jobOrderNo) return `№ ${STUDIO_INFO.defaultJobOrderNo}`;
  const trimmed = String(jobOrderNo).trim();
  const num = parseInt(trimmed, 10);
  if (!isNaN(num) && /^\d+$/.test(trimmed)) {
    return `№ ${String(num).padStart(5, '0')}`;
  }
  return `№ ${trimmed}`;
}

/**
 * Formats a client's full name in `FAMILY, GIVEN M.` format.
 */
export function formatClientName(
  reg: Pick<Registration, 'family_name' | 'given_name' | 'middle_name'>
): string {
  const middleInitial = reg.middle_name?.trim() ? ` ${reg.middle_name.trim()[0]}.` : '';
  return `${reg.family_name}, ${reg.given_name}${middleInitial}`;
}

/**
 * Formats a date string into `Nov 4, 2026` format.
 */
export function formatShortDate(dateValue?: string | number | Date): string {
  return new Date(dateValue || Date.now()).toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Safely parses package `inclusions` which may be stored as a JSON string or array.
 */
export function parsePackageInclusions(inclusions: string[] | string | undefined | null): string[] {
  if (!inclusions) return [];
  if (Array.isArray(inclusions)) return inclusions;
  if (typeof inclusions === 'string') {
    try {
      const parsed = JSON.parse(inclusions);
      return Array.isArray(parsed) ? parsed : [inclusions];
    } catch {
      return [inclusions];
    }
  }
  return [];
}

/**
 * Splits a full name from a master roster into `{ givenName, familyName }`.
 */
export function splitFullName(fullName: string): { givenName: string; familyName: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length >= 2) {
    return {
      familyName: parts[parts.length - 1],
      givenName: parts.slice(0, -1).join(' '),
    };
  }
  return {
    familyName: '',
    givenName: fullName.trim(),
  };
}
