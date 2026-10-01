import { parseLocalDateTime } from '../local-date-time.util';

describe('parseLocalDateTime', () => {
  it.each([
    ['UTC normal time', '2026-09-30T19:00', 'UTC', '2026-09-30T19:00:00.000Z'],
    ['Zurich winter time', '2026-01-15T10:00', 'Europe/Zurich', '2026-01-15T09:00:00.000Z'],
    ['Zurich summer time', '2026-07-15T10:00', 'Europe/Zurich', '2026-07-15T08:00:00.000Z'],
    ['before the Zurich overlap', '2026-10-25T01:59', 'Europe/Zurich', '2026-10-24T23:59:00.000Z'],
    ['after the Zurich overlap', '2026-10-25T03:00', 'Europe/Zurich', '2026-10-25T02:00:00.000Z'],
    ['a year affected by the Date.UTC 1900 mapping', '0099-01-01T00:00', 'UTC', '0099-01-01T00:00:00.000Z'],
    ['a representable five-digit year', '20266-09-30T19:00', 'UTC', '+020266-09-30T19:00:00.000Z'],
  ])('parses %s', (_name, value, timeZone, iso) => {
    expect(parseLocalDateTime(value, timeZone)).toEqual({ status: 'valid', date: new Date(iso) });
  });

  it.each([
    ['Zurich spring gap', '2026-03-29T02:30', 'Europe/Zurich'],
    ['Lord Howe 30-minute spring gap', '2026-10-04T02:15', 'Australia/Lord_Howe'],
  ])('rejects the %s', (_name, value, timeZone) => {
    expect(parseLocalDateTime(value, timeZone)).toEqual({ status: 'invalid' });
  });

  it.each([
    ['Zurich overlap', '2026-10-25T02:30', 'Europe/Zurich'],
    ['Lord Howe 30-minute overlap', '2026-04-05T01:45', 'Australia/Lord_Howe'],
  ])('rejects the ambiguous %s', (_name, value, timeZone) => {
    expect(parseLocalDateTime(value, timeZone)).toEqual({ status: 'ambiguous' });
  });

  it.each([
    '2026-1-1T00:00',
    '2026-01-01T00:00:00',
    '',
    '2026-13-01T00:00',
    '2026-02-30T00:00',
    '275760-09-14T00:00',
    '999999-01-01T00:00',
  ])('rejects malformed or unrepresentable value %p', (value) => {
    expect(parseLocalDateTime(value, 'UTC')).toEqual({ status: 'invalid' });
  });
});
