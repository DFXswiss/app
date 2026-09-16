import { RealUnitCustomerListDto } from 'src/dto/realunit-compliance.dto';
import { isEmptyAccount } from 'src/util/realunit-customer-filter';

const customer = (overrides: Partial<RealUnitCustomerListDto>): RealUnitCustomerListDto => ({
  id: 1,
  kycStatus: 'NA',
  canScreen: false,
  ...overrides,
});

describe('isEmptyAccount', () => {
  it('is true for a wallet-only account (no name, no mail, KYC 0, resolved zero balance)', () => {
    expect(isEmptyAccount(customer({ kycLevel: '0', balance: 0 }))).toBe(true);
  });

  it('is false when kycLevel is missing entirely (an unresolved level fails open to visible)', () => {
    expect(isEmptyAccount(customer({ balance: 0 }))).toBe(false);
  });

  it('is false when the balance is unresolved (undefined) — an outage must never hide a holder', () => {
    expect(isEmptyAccount(customer({ kycLevel: '0' }))).toBe(false);
  });

  it('is false when a mail is present', () => {
    expect(isEmptyAccount(customer({ mail: 'a@b.ch', balance: 0 }))).toBe(false);
  });

  it('is false when a name is present', () => {
    expect(isEmptyAccount(customer({ name: 'Alice Muster', balance: 0 }))).toBe(false);
  });

  it('is false when KYC has progressed', () => {
    expect(isEmptyAccount(customer({ kycLevel: '10', balance: 0 }))).toBe(false);
  });

  it('is false for a terminated/rejected account (negative level is not "no progress")', () => {
    expect(isEmptyAccount(customer({ kycLevel: '-10', balance: 0 }))).toBe(false);
  });

  it('is false when the account holds REALU', () => {
    expect(isEmptyAccount(customer({ balance: 3 }))).toBe(false);
  });

  it("is false when kycStatus is 'Check' even at level 0 with zero balance (status progress keeps it visible)", () => {
    expect(isEmptyAccount(customer({ kycStatus: 'Check', kycLevel: '0', balance: 0 }))).toBe(false);
  });

  it("is false when kycStatus is 'Rejected' even at level 0 with zero balance", () => {
    expect(isEmptyAccount(customer({ kycStatus: 'Rejected', kycLevel: '0', balance: 0 }))).toBe(false);
  });

  it("is false when kycStatus is 'Terminated' even at level 0 with zero balance", () => {
    expect(isEmptyAccount(customer({ kycStatus: 'Terminated', kycLevel: '0', balance: 0 }))).toBe(false);
  });

  it('the api sends kycLevel as a number over the wire — Number() must treat it like the string form', () => {
    expect(isEmptyAccount(customer({ kycLevel: 0 as unknown as string, balance: 0 }))).toBe(true);
    expect(isEmptyAccount(customer({ kycLevel: 10 as unknown as string, balance: 0 }))).toBe(false);
    expect(isEmptyAccount(customer({ kycLevel: -10 as unknown as string, balance: 0 }))).toBe(false);
  });

  it('is false when kycLevel is a blank string (a degenerate wire value is not a resolved level)', () => {
    expect(isEmptyAccount(customer({ kycLevel: '', balance: 0 }))).toBe(false);
    expect(isEmptyAccount(customer({ kycLevel: '   ', balance: 0 }))).toBe(false);
  });

  it('is false when kycLevel is JSON null (unresolved, fails open to visible)', () => {
    expect(isEmptyAccount(customer({ kycLevel: null as unknown as string, balance: 0 }))).toBe(false);
  });

  it('is false when kycLevel is a non-numeric string (NaN !== 0, fails open to visible)', () => {
    expect(isEmptyAccount(customer({ kycLevel: 'unknown', balance: 0 }))).toBe(false);
  });

  it('is true when name and mail are empty strings (empty string counts as missing)', () => {
    expect(isEmptyAccount(customer({ name: '', mail: '', kycLevel: '0', balance: 0 }))).toBe(true);
  });

  it('is false for a fractional resolved balance', () => {
    expect(isEmptyAccount(customer({ kycLevel: '0', balance: 0.5 }))).toBe(false);
  });

  it('is false for a negative resolved balance', () => {
    expect(isEmptyAccount(customer({ kycLevel: '0', balance: -1 }))).toBe(false);
  });
});
