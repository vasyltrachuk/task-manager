import type {
  BusinessDayShift,
  DueRuleConfig,
  RuleDueDateResolution,
  RulePeriodWindow,
  RuleRecurrenceConfig,
} from './types';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function toDateOnly(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function addDays(date: Date, days: number): Date {
  return new Date(toDateOnly(date).getTime() + days * MS_PER_DAY);
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function buildDateWithClampedDay(year: number, monthIndex: number, day: number): Date {
  const clamped = Math.max(1, Math.min(day, daysInMonth(year, monthIndex)));
  return new Date(Date.UTC(year, monthIndex, clamped));
}

function shiftMonth(year: number, monthIndex: number, offset: number): { year: number; monthIndex: number } {
  const shifted = monthIndex + offset;
  const nextYear = year + Math.floor(shifted / 12);
  let nextMonth = shifted % 12;
  if (nextMonth < 0) nextMonth += 12;
  return { year: nextYear, monthIndex: nextMonth };
}

function isBusinessDay(date: Date, holidaySet: Set<string>): boolean {
  const weekday = date.getUTCDay();
  if (weekday === 0 || weekday === 6) return false;
  const key = date.toISOString().slice(0, 10);
  return !holidaySet.has(key);
}

function shiftToBusinessDay(
  date: Date,
  strategy: BusinessDayShift,
  holidaySet: Set<string>
): Date {
  if (strategy === 'none') return date;
  if (isBusinessDay(date, holidaySet)) return date;

  const step = strategy === 'prev_business_day' ? -1 : 1;
  let cursor = date;

  while (!isBusinessDay(cursor, holidaySet)) {
    cursor = addDays(cursor, step);
  }

  return cursor;
}

function getQuarterStartMonth(monthIndex: number): number {
  return Math.floor(monthIndex / 3) * 3;
}

function getQuarterNumber(monthIndex: number): number {
  return Math.floor(monthIndex / 3) + 1;
}

function startOfMonthUtc(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function endOfMonthUtc(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
}

function startOfQuarterUtc(date: Date): Date {
  const month = getQuarterStartMonth(date.getUTCMonth());
  return new Date(Date.UTC(date.getUTCFullYear(), month, 1));
}

function endOfQuarterUtc(date: Date): Date {
  const quarterStart = getQuarterStartMonth(date.getUTCMonth());
  return new Date(Date.UTC(date.getUTCFullYear(), quarterStart + 3, 0));
}

function startOfYearUtc(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
}

function endOfYearUtc(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), 11, 31));
}

function monthKey(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function quarterKey(date: Date): string {
  return `${date.getUTCFullYear()}-Q${getQuarterNumber(date.getUTCMonth())}`;
}

function yearKey(date: Date): string {
  return String(date.getUTCFullYear());
}

function semiMonthlyKey(date: Date, event?: string): string {
  const base = monthKey(date);
  return event ? `${base}-${event}` : `${base}-semi`;
}

export function enumeratePeriodsInRange(
  rangeStartInput: Date,
  rangeEndInput: Date,
  recurrence: RuleRecurrenceConfig
): RulePeriodWindow[] {
  const rangeStart = toDateOnly(rangeStartInput);
  const rangeEnd = toDateOnly(rangeEndInput);
  const result: RulePeriodWindow[] = [];

  if (rangeEnd < rangeStart) return result;

  if (recurrence.kind === 'monthly' || recurrence.kind === 'semi_monthly') {
    let cursor = startOfMonthUtc(rangeStart);
    while (cursor <= rangeEnd) {
      const start = startOfMonthUtc(cursor);
      const end = endOfMonthUtc(cursor);
      result.push({
        periodKey: recurrence.kind === 'semi_monthly' ? semiMonthlyKey(cursor, recurrence.event) : monthKey(cursor),
        periodStart: start,
        periodEnd: end,
      });
      cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
    }
    return result;
  }

  if (recurrence.kind === 'quarterly') {
    let cursor = startOfQuarterUtc(rangeStart);
    while (cursor <= rangeEnd) {
      const start = startOfQuarterUtc(cursor);
      const end = endOfQuarterUtc(cursor);
      result.push({
        periodKey: quarterKey(cursor),
        periodStart: start,
        periodEnd: end,
      });
      cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 3, 1));
    }
    return result;
  }

  let cursor = startOfYearUtc(rangeStart);
  while (cursor <= rangeEnd) {
    result.push({
      periodKey: yearKey(cursor),
      periodStart: startOfYearUtc(cursor),
      periodEnd: endOfYearUtc(cursor),
    });
    cursor = new Date(Date.UTC(cursor.getUTCFullYear() + 1, 0, 1));
  }

  return result;
}

export function resolveDueDateForPeriod(
  period: RulePeriodWindow,
  dueRule: DueRuleConfig,
  options?: {
    holidays?: string[];
    profileDayValues?: {
      payroll_advance_day?: number;
      payroll_final_day?: number;
    };
  }
): RuleDueDateResolution {
  const holidaySet = new Set(options?.holidays ?? []);
  const shift = dueRule.shift_if_non_business_day ?? 'none';

  let dueDate: Date;

  if (dueRule.kind === 'days_after_period_end') {
    dueDate = addDays(period.periodEnd, dueRule.days);
  } else if (dueRule.kind === 'fixed_date') {
    dueDate = buildDateWithClampedDay(period.periodStart.getUTCFullYear(), dueRule.month - 1, dueRule.day);
  } else if (dueRule.kind === 'profile_day_of_month') {
    const source = period.periodStart;
    const monthOffset = dueRule.month_offset ?? 0;
    const shifted = shiftMonth(source.getUTCFullYear(), source.getUTCMonth(), monthOffset);
    const day =
      dueRule.profile_field === 'payroll_advance_day'
        ? options?.profileDayValues?.payroll_advance_day ?? 15
        : options?.profileDayValues?.payroll_final_day ?? 30;
    dueDate = buildDateWithClampedDay(shifted.year, shifted.monthIndex, day);
  } else {
    const source = period.periodStart;
    const monthOffset = dueRule.month_offset ?? 0;
    const shifted = shiftMonth(source.getUTCFullYear(), source.getUTCMonth(), monthOffset);
    dueDate = buildDateWithClampedDay(shifted.year, shifted.monthIndex, dueRule.day);
  }

  const shiftedDueDate = shiftToBusinessDay(toDateOnly(dueDate), shift, holidaySet);

  return {
    dueDate: shiftedDueDate,
    periodKey: period.periodKey,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
  };
}
