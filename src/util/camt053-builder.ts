interface PartyAddress {
  street?: string;
  houseNumber?: string;
  zip?: string;
  city?: string;
  country?: string;
}

export interface Camt053Data {
  bookingDate: string;
  valueDate: string;
  amount: string;
  currency: string;
  direction: 'CRDT' | 'DBIT';
  accountIban: string;
  accountOwner: string;
  accountBank: string;
  name: string;
  street?: string;
  houseNumber?: string;
  zip?: string;
  city?: string;
  country?: string;
  iban: string;
  remittanceInfo: string;
}

function escapeXml(str?: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildPartyXml(name: string, address?: PartyAddress): string {
  const hasAddress = address?.street || address?.houseNumber || address?.zip || address?.city || address?.country;

  const addressXml = hasAddress
    ? [
        '<PstlAdr>',
        address?.street ? `<StrtNm>${escapeXml(address.street)}</StrtNm>` : '',
        address?.houseNumber ? `<BldgNb>${escapeXml(address.houseNumber)}</BldgNb>` : '',
        address?.zip ? `<PstCd>${escapeXml(address.zip)}</PstCd>` : '',
        address?.city ? `<TwnNm>${escapeXml(address.city)}</TwnNm>` : '',
        address?.country ? `<Ctry>${escapeXml(address.country)}</Ctry>` : '',
        '</PstlAdr>',
      ]
        .filter(Boolean)
        .join('')
    : '';

  return `<Nm>${escapeXml(name)}</Nm>${addressXml}`;
}

function createUuid(): string {
  const cryptoApi = globalThis.crypto;

  if (typeof cryptoApi?.randomUUID === 'function') {
    try {
      return cryptoApi.randomUUID();
    } catch {
      // Some browsers expose randomUUID but reject it outside a secure context.
    }
  }

  if (typeof cryptoApi?.getRandomValues !== 'function') {
    throw new Error('Secure random UUID generation is unavailable.');
  }

  try {
    const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-');
  } catch {
    throw new Error('Secure random UUID generation is unavailable.');
  }
}

export function buildCamt053Xml(data: Camt053Data): string {
  const now = new Date();
  const timestamp = now.toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const isoTimestamp = now.toISOString().replace('Z', '+00:00');
  const ref = createUuid();
  const parsed = parseFloat(data.amount);
  const amount = isNaN(parsed) ? '0.00' : parsed.toFixed(2);
  const isCredit = data.direction === 'CRDT';

  const accountIban = data.accountIban.replace(/\s/g, '');
  const accountOwner = data.accountOwner;
  const accountBank = data.accountBank;

  const counterpartyAddress: PartyAddress = {
    street: data.street,
    houseNumber: data.houseNumber,
    zip: data.zip,
    city: data.city,
    country: data.country,
  };
  const cleanIban = data.iban.replace(/\s/g, '');

  const bookingDate = escapeXml(data.bookingDate);
  const valueDate = escapeXml(data.valueDate);
  const currency = escapeXml(data.currency);

  const debtorXml = isCredit
    ? `<Dbtr>${buildPartyXml(data.name, counterpartyAddress)}</Dbtr>
                            <DbtrAcct><Id><IBAN>${escapeXml(cleanIban)}</IBAN></Id></DbtrAcct>`
    : `<Dbtr><Nm>${escapeXml(accountOwner)}</Nm></Dbtr>
                            <DbtrAcct><Id><IBAN>${escapeXml(accountIban)}</IBAN></Id></DbtrAcct>`;

  const creditorXml = isCredit
    ? `<Cdtr><Nm>${escapeXml(accountOwner)}</Nm></Cdtr>
                            <CdtrAcct><Id><IBAN>${escapeXml(accountIban)}</IBAN></Id></CdtrAcct>`
    : `<Cdtr>${buildPartyXml(data.name, counterpartyAddress)}</Cdtr>
                            <CdtrAcct><Id><IBAN>${escapeXml(cleanIban)}</IBAN></Id></CdtrAcct>`;

  const txCode = isCredit
    ? '<Cd>RCDT</Cd><SubFmlyCd>XBCT</SubFmlyCd>'
    : '<Cd>ICDT</Cd><SubFmlyCd>DMCT</SubFmlyCd>';

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Document xsi:schemaLocation="urn:iso:std:iso:20022:tech:xsd:camt.053.001.04 camt.053.001.04.xsd" xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.04" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
    <BkToCstmrStmt>
        <GrpHdr>
            <MsgId>MSG-C053-${timestamp}-01</MsgId>
            <CreDtTm>${isoTimestamp}</CreDtTm>
            <AddtlInf>PRODUCTIVE</AddtlInf>
        </GrpHdr>
        <Stmt>
            <Id>STM-C053-${timestamp}-01</Id>
            <ElctrncSeqNb>1</ElctrncSeqNb>
            <CreDtTm>${isoTimestamp}</CreDtTm>
            <FrToDt>
                <FrDtTm>${bookingDate}T00:00:00.000+00:00</FrDtTm>
                <ToDtTm>${bookingDate}T23:59:59.999+00:00</ToDtTm>
            </FrToDt>
            <Acct>
                <Id>
                    <IBAN>${escapeXml(accountIban)}</IBAN>
                </Id>
                <Ownr>
                    <Nm>${escapeXml(accountOwner)}</Nm>
                </Ownr>
                <Svcr>
                    <FinInstnId>
                        <Nm>${escapeXml(accountBank)}</Nm>
                    </FinInstnId>
                </Svcr>
            </Acct>
            <Bal>
                <Tp>
                    <CdOrPrtry>
                        <Cd>OPBD</Cd>
                    </CdOrPrtry>
                </Tp>
                <Amt Ccy="${currency}">0</Amt>
                <CdtDbtInd>CRDT</CdtDbtInd>
                <Dt>
                    <Dt>${bookingDate}</Dt>
                </Dt>
            </Bal>
            <Bal>
                <Tp>
                    <CdOrPrtry>
                        <Cd>CLBD</Cd>
                    </CdOrPrtry>
                </Tp>
                <Amt Ccy="${currency}">0</Amt>
                <CdtDbtInd>CRDT</CdtDbtInd>
                <Dt>
                    <Dt>${bookingDate}</Dt>
                </Dt>
            </Bal>
            <Ntry>
                <Amt Ccy="${currency}">${amount}</Amt>
                <CdtDbtInd>${data.direction}</CdtDbtInd>
                <RvslInd>false</RvslInd>
                <Sts>BOOK</Sts>
                <BookgDt>
                    <Dt>${bookingDate}</Dt>
                </BookgDt>
                <ValDt>
                    <Dt>${valueDate}</Dt>
                </ValDt>
                <AcctSvcrRef>${ref}</AcctSvcrRef>
                <BkTxCd>
                    <Domn>
                        <Cd>PMNT</Cd>
                        <Fmly>
                            ${txCode}
                        </Fmly>
                    </Domn>
                    <Prtry>
                        <Cd>1000</Cd>
                    </Prtry>
                </BkTxCd>
                <AmtDtls>
                    <TxAmt>
                        <Amt Ccy="${currency}">${amount}</Amt>
                    </TxAmt>
                </AmtDtls>
                <NtryDtls>
                    <TxDtls>
                        <Amt Ccy="${currency}">${amount}</Amt>
                        <CdtDbtInd>${data.direction}</CdtDbtInd>
                        <BkTxCd>
                            <Domn>
                                <Cd>PMNT</Cd>
                                <Fmly>
                                    ${txCode}
                                </Fmly>
                            </Domn>
                        </BkTxCd>
                        <RltdPties>
                            ${debtorXml}
                            ${creditorXml}
                        </RltdPties>
                        <RmtInf>
                            <Ustrd>${escapeXml(data.remittanceInfo)}</Ustrd>
                        </RmtInf>
                    </TxDtls>
                </NtryDtls>
                <AddtlNtryInf>${isCredit ? 'Gutschrift' : 'Zahlung'} ${escapeXml(data.name)}</AddtlNtryInf>
            </Ntry>
        </Stmt>
    </BkToCstmrStmt>
</Document>`;
}
