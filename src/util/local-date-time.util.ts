export type LocalDateTimeResult = { status: 'valid'; date: Date } | { status: 'invalid' } | { status: 'ambiguous' };

const LOCAL_DATE_TIME_PATTERN = /^(\d{4,6})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;

function hasExpectedComponents(date: Date, expected: number[]): boolean {
  const components = [
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
    date.getUTCHours(),
    date.getUTCMinutes(),
  ];

  for (let index = 0; index < components.length; index += 1) {
    if (components[index] !== expected[index]) return false;
  }
  return true;
}

function partNumber(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): number {
  let value = '';
  for (const part of parts) {
    if (part.type === type) value = part.value;
  }
  return Number(value);
}

function utcMilliseconds(year: number, month: number, day: number, hour: number, minute: number): number {
  const time = Date.UTC(year, month - 1, day, hour, minute);
  if (year > 99) return time;

  const date = new Date(Date.UTC(year + 400, month - 1, day, hour, minute));
  date.setUTCFullYear(year);
  return date.getTime();
}

function wallTime(formatter: Intl.DateTimeFormat, time: number): number {
  const parts = formatter.formatToParts(new Date(time));
  return utcMilliseconds(
    partNumber(parts, 'year'),
    partNumber(parts, 'month'),
    partNumber(parts, 'day'),
    partNumber(parts, 'hour'),
    partNumber(parts, 'minute'),
  );
}

export function parseLocalDateTime(value: string, timeZone: string): LocalDateTimeResult {
  const match = LOCAL_DATE_TIME_PATTERN.exec(value);
  if (match === null) return { status: 'invalid' };

  const components = match.slice(1).map(Number);
  const [year, month, day, hour, minute] = components;
  const naive = utcMilliseconds(year, month, day, hour, minute);
  if (Number.isFinite(naive) === false) return { status: 'invalid' };

  const naiveDate = new Date(naive);
  if (hasExpectedComponents(naiveDate, components) === false) return { status: 'invalid' };

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  const sampleTimes = [naive - DAY_IN_MILLISECONDS, naive, naive + DAY_IN_MILLISECONDS];
  const offsets = new Set(sampleTimes.map((time) => wallTime(formatter, time) - time));
  const matches = new Set<number>();

  for (const offset of offsets) {
    const candidate = naive - offset;
    if (wallTime(formatter, candidate) === naive) matches.add(candidate);
  }

  if (matches.size === 0) return { status: 'invalid' };
  if (matches.size >= 2) return { status: 'ambiguous' };

  const [time] = matches;
  return { status: 'valid', date: new Date(time) };
}
