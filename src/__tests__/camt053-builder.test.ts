import * as nodeCrypto from 'crypto';
import { Camt053Data, buildCamt053Xml } from 'src/util/camt053-builder';

const FROZEN_NOW = new Date('2026-03-15T12:34:56.000Z');
const FROZEN_UUID = '11111111-1111-1111-1111-111111111111';
const FROZEN_TIMESTAMP = '20260315123456';
const FROZEN_ISO = '2026-03-15T12:34:56.000+00:00';

function baseData(overrides: Partial<Camt053Data> = {}): Camt053Data {
  return {
    bookingDate: '2026-03-10',
    valueDate: '2026-03-11',
    amount: '100.00',
    currency: 'CHF',
    direction: 'CRDT',
    accountIban: 'CH9300762011623852957',
    accountOwner: 'Account Owner AG',
    accountBank: 'Example Bank',
    name: 'Counterparty Name',
    iban: 'DE89370400440532013000',
    remittanceInfo: 'Invoice 42',
    ...overrides,
  };
}

describe('buildCamt053Xml', () => {
  const originalCrypto = Object.getOwnPropertyDescriptor(globalThis, 'crypto');

  beforeEach(() => {
    Object.defineProperty(globalThis, 'crypto', { value: nodeCrypto, configurable: true });
    jest.useFakeTimers({ now: FROZEN_NOW });
    // CRA Jest does not freeze new Date() via useFakeTimers({ now }); production uses toISOString().
    jest.spyOn(Date.prototype, 'toISOString').mockReturnValue('2026-03-15T12:34:56.000Z');
    jest.spyOn(nodeCrypto, 'randomUUID').mockReturnValue(FROZEN_UUID);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    if (originalCrypto) {
      Object.defineProperty(globalThis, 'crypto', originalCrypto);
    } else {
      delete (globalThis as { crypto?: Crypto }).crypto;
    }
  });

  it('builds a CRDT entry with full address, Gutschrift and RCDT/XBCT', () => {
    const xml = buildCamt053Xml(
      baseData({
        direction: 'CRDT',
        street: 'Bahnhofstrasse',
        houseNumber: '1',
        zip: '8001',
        city: 'Zurich',
        country: 'CH',
        name: 'Debtor Corp',
        accountOwner: 'Creditor Owner',
      }),
    );

    expect(xml).toContain(
      '<Ntry>\n                <Amt Ccy="CHF">100.00</Amt>\n                <CdtDbtInd>CRDT</CdtDbtInd>',
    );
    expect(xml).toContain('<Amt Ccy="CHF">100.00</Amt>\n                        <CdtDbtInd>CRDT</CdtDbtInd>');
    expect((xml.match(/<CdtDbtInd>CRDT<\/CdtDbtInd>/g) || []).length).toBe(4);
    expect((xml.match(/<CdtDbtInd>DBIT<\/CdtDbtInd>/g) || []).length).toBe(0);
    expect(xml).not.toContain('<CdtDbtInd>DBIT</CdtDbtInd>');
    expect(xml).toContain('<Cd>RCDT</Cd><SubFmlyCd>XBCT</SubFmlyCd>');
    expect((xml.match(/<Cd>RCDT<\/Cd><SubFmlyCd>XBCT<\/SubFmlyCd>/g) || []).length).toBe(2);
    expect(xml).toContain('<AddtlNtryInf>Gutschrift Debtor Corp</AddtlNtryInf>');
    expect(xml).toContain(
      `<Acct>
                <Id>
                    <IBAN>CH9300762011623852957</IBAN>`,
    );
    expect(xml).toContain('<BookgDt>\n                    <Dt>2026-03-10</Dt>\n                </BookgDt>');
    expect(xml).toContain('<ValDt>\n                    <Dt>2026-03-11</Dt>\n                </ValDt>');
    expect(xml).toContain('<FrDtTm>2026-03-10T00:00:00.000+00:00</FrDtTm>');
    expect(xml).toContain('<ToDtTm>2026-03-10T23:59:59.999+00:00</ToDtTm>');

    expect(xml).toContain(
      '<Dbtr><Nm>Debtor Corp</Nm><PstlAdr><StrtNm>Bahnhofstrasse</StrtNm><BldgNb>1</BldgNb><PstCd>8001</PstCd><TwnNm>Zurich</TwnNm><Ctry>CH</Ctry></PstlAdr></Dbtr>',
    );
    expect(xml).toContain('<Cdtr><Nm>Creditor Owner</Nm></Cdtr>');
    expect(xml).toContain('<DbtrAcct><Id><IBAN>DE89370400440532013000</IBAN></Id></DbtrAcct>');
    expect(xml).toContain('<CdtrAcct><Id><IBAN>CH9300762011623852957</IBAN></Id></CdtrAcct>');
    expect(xml).toContain(`<AcctSvcrRef>${FROZEN_UUID}</AcctSvcrRef>`);
  });

  it('builds a DBIT entry without address, Zahlung and ICDT/DMCT', () => {
    const xml = buildCamt053Xml(
      baseData({
        direction: 'DBIT',
        name: 'Creditor Corp',
        accountOwner: 'Debtor Owner',
      }),
    );

    expect(xml).toContain(
      '<Ntry>\n                <Amt Ccy="CHF">100.00</Amt>\n                <CdtDbtInd>DBIT</CdtDbtInd>',
    );
    expect(xml).toContain('<Amt Ccy="CHF">100.00</Amt>\n                        <CdtDbtInd>DBIT</CdtDbtInd>');
    expect((xml.match(/<CdtDbtInd>CRDT<\/CdtDbtInd>/g) || []).length).toBe(2);
    expect((xml.match(/<CdtDbtInd>DBIT<\/CdtDbtInd>/g) || []).length).toBe(2);
    expect(xml).toContain('<Cd>ICDT</Cd><SubFmlyCd>DMCT</SubFmlyCd>');
    expect((xml.match(/<Cd>ICDT<\/Cd><SubFmlyCd>DMCT<\/SubFmlyCd>/g) || []).length).toBe(2);
    expect(xml).toContain('<AddtlNtryInf>Zahlung Creditor Corp</AddtlNtryInf>');
    expect(xml).toContain(
      `<Acct>
                <Id>
                    <IBAN>CH9300762011623852957</IBAN>`,
    );
    expect(xml).not.toContain('<PstlAdr>');
    expect(xml).toContain('<Dbtr><Nm>Debtor Owner</Nm></Dbtr>');
    expect(xml).toContain('<Cdtr><Nm>Creditor Corp</Nm></Cdtr>');
    expect(xml).toContain('<DbtrAcct><Id><IBAN>CH9300762011623852957</IBAN></Id></DbtrAcct>');
    expect(xml).toContain('<CdtrAcct><Id><IBAN>DE89370400440532013000</IBAN></Id></CdtrAcct>');
  });

  it('builds a DBIT entry with address on Cdtr and not on Dbtr', () => {
    const xml = buildCamt053Xml(
      baseData({
        direction: 'DBIT',
        street: 'Hauptstrasse',
        name: 'Creditor Corp',
        accountOwner: 'Debtor Owner',
      }),
    );

    expect(xml).toContain('<Cdtr><Nm>Creditor Corp</Nm><PstlAdr><StrtNm>Hauptstrasse</StrtNm></PstlAdr></Cdtr>');
    expect(xml).toContain('<Dbtr><Nm>Debtor Owner</Nm></Dbtr>');
    expect(xml).not.toContain('<Dbtr><Nm>Debtor Owner</Nm><PstlAdr>');
  });

  it('emits only StrtNm when street is the sole address field', () => {
    const xml = buildCamt053Xml(baseData({ street: 'Main Street' }));

    expect(xml).toContain('<PstlAdr><StrtNm>Main Street</StrtNm></PstlAdr>');
    expect(xml).not.toContain('<BldgNb>');
    expect(xml).not.toContain('<PstCd>');
    expect(xml).not.toContain('<TwnNm>');
    expect(xml).not.toContain('<Ctry>');
  });

  it('emits only BldgNb when houseNumber is the sole address field', () => {
    const xml = buildCamt053Xml(baseData({ houseNumber: '42a' }));

    expect(xml).toContain('<PstlAdr><BldgNb>42a</BldgNb></PstlAdr>');
    expect(xml).not.toContain('<StrtNm>');
    expect(xml).not.toContain('<PstCd>');
    expect(xml).not.toContain('<TwnNm>');
    expect(xml).not.toContain('<Ctry>');
  });

  it('emits only PstCd when zip is the sole address field', () => {
    const xml = buildCamt053Xml(baseData({ zip: '8000' }));

    expect(xml).toContain('<PstlAdr><PstCd>8000</PstCd></PstlAdr>');
    expect(xml).not.toContain('<StrtNm>');
    expect(xml).not.toContain('<BldgNb>');
    expect(xml).not.toContain('<TwnNm>');
    expect(xml).not.toContain('<Ctry>');
  });

  it('emits only TwnNm when city is the sole address field', () => {
    const xml = buildCamt053Xml(baseData({ city: 'Bern' }));

    expect(xml).toContain('<PstlAdr><TwnNm>Bern</TwnNm></PstlAdr>');
    expect(xml).not.toContain('<StrtNm>');
    expect(xml).not.toContain('<BldgNb>');
    expect(xml).not.toContain('<PstCd>');
    expect(xml).not.toContain('<Ctry>');
  });

  it('emits only Ctry when country is the sole address field', () => {
    const xml = buildCamt053Xml(baseData({ country: 'DE' }));

    expect(xml).toContain('<PstlAdr><Ctry>DE</Ctry></PstlAdr>');
    expect(xml).not.toContain('<StrtNm>');
    expect(xml).not.toContain('<BldgNb>');
    expect(xml).not.toContain('<PstCd>');
    expect(xml).not.toContain('<TwnNm>');
  });

  it('escapes XML special characters in party, remittance, currency and bank fields', () => {
    const special = `A&B <C> "D" 'E'`;
    const escaped = 'A&amp;B &lt;C&gt; &quot;D&quot; &apos;E&apos;';

    const xml = buildCamt053Xml(
      baseData({
        direction: 'CRDT',
        name: special,
        remittanceInfo: special,
        currency: special,
        accountOwner: special,
        accountBank: special,
        street: special,
        houseNumber: special,
        zip: special,
        city: special,
        country: special,
      }),
    );

    expect(xml).toContain(`<Nm>${escaped}</Nm>`);
    expect(xml).toContain(`<Dbtr><Nm>${escaped}</Nm>`);
    expect(xml).toContain(`<Ustrd>${escaped}</Ustrd>`);
    expect(xml).toContain(`Ccy="${escaped}"`);
    expect(xml).toContain(`<StrtNm>${escaped}</StrtNm>`);
    expect(xml).toContain(`<BldgNb>${escaped}</BldgNb>`);
    expect(xml).toContain(`<PstCd>${escaped}</PstCd>`);
    expect(xml).toContain(`<TwnNm>${escaped}</TwnNm>`);
    expect(xml).toContain(`<Ctry>${escaped}</Ctry>`);
    expect(xml).toContain(`<AddtlNtryInf>Gutschrift ${escaped}</AddtlNtryInf>`);
    expect(xml).toContain(
      `<Ownr>
                    <Nm>${escaped}</Nm>
                </Ownr>`,
    );
    expect(xml).toContain(
      `<FinInstnId>
                        <Nm>${escaped}</Nm>
                    </FinInstnId>`,
    );
  });

  it('strips whitespace from account and counterparty IBANs', () => {
    const xml = buildCamt053Xml(
      baseData({
        accountIban: 'CH93 0076 2011 6238 5295 7',
        iban: 'DE89 3704 0044 0532 0130 00',
      }),
    );

    expect(xml).toContain('<IBAN>CH9300762011623852957</IBAN>');
    expect(xml).toContain('<IBAN>DE89370400440532013000</IBAN>');
    expect(xml).not.toContain('CH93 0076');
    expect(xml).not.toContain('DE89 3704');
  });

  it('formats a partial amount to two decimal places', () => {
    const xml = buildCamt053Xml(baseData({ amount: '12.5' }));

    expect((xml.match(/<Amt Ccy="CHF">12.50<\/Amt>/g) || []).length).toBe(3);
    expect(xml).not.toContain('>12.5<');
  });

  it('falls back to 0.00 for a non-numeric amount', () => {
    const xml = buildCamt053Xml(baseData({ amount: 'not-a-number' }));

    expect((xml.match(/<Amt Ccy="CHF">0.00<\/Amt>/g) || []).length).toBe(3);
  });

  it('handles empty remittance and empty optional address strings without throwing', () => {
    expect(() =>
      buildCamt053Xml(
        baseData({
          remittanceInfo: '',
          street: '',
          houseNumber: '',
          zip: '',
          city: '',
          country: '',
        }),
      ),
    ).not.toThrow();

    const xml = buildCamt053Xml(
      baseData({
        remittanceInfo: '',
        street: '',
        houseNumber: '',
        zip: '',
        city: '',
        country: '',
      }),
    );

    expect(xml).toContain('<Ustrd></Ustrd>');
    expect(xml).not.toContain('<PstlAdr>');
  });

  it('uses the frozen timestamp and UUID in MsgId, CreDtTm and AcctSvcrRef', () => {
    const xml = buildCamt053Xml(baseData());

    expect(xml).toContain(`<MsgId>MSG-C053-${FROZEN_TIMESTAMP}-01</MsgId>`);
    expect(xml).toContain(`<Id>STM-C053-${FROZEN_TIMESTAMP}-01</Id>`);
    expect(xml).toContain(`<CreDtTm>${FROZEN_ISO}</CreDtTm>`);
    expect(xml).toContain(`<AcctSvcrRef>${FROZEN_UUID}</AcctSvcrRef>`);
  });
});
