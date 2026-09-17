/**
 * App 2.0 copies of main-app constants must stay in lockstep.
 * The copies exist so src/app2 does not import private main-app modules.
 */

jest.mock('@dfx.swiss/react', () => ({
  TransactionError: {
    EMAIL_REQUIRED: 'EmailRequired',
    RECOMMENDATION_REQUIRED: 'RecommendationRequired',
    KYC_REQUIRED: 'KycRequired',
    TRADING_NOT_ALLOWED: 'TradingNotAllowed',
    KYC_DATA_REQUIRED: 'KycDataRequired',
    KYC_REQUIRED_INSTANT: 'KycRequiredInstant',
    LIMIT_EXCEEDED: 'LimitExceeded',
    BANK_TRANSACTION_MISSING: 'BankTransactionMissing',
    BANK_TRANSACTION_OR_VIDEO_MISSING: 'BankTransactionOrVideoMissing',
    VIDEO_IDENT_REQUIRED: 'VideoIdentRequired',
    NATIONALITY_NOT_ALLOWED: 'NationalityNotAllowed',
    PAYMENT_METHOD_NOT_ALLOWED: 'PaymentMethodNotAllowed',
  },
  useApi: () => ({ call: jest.fn() }),
}));

import { StoreKey as MainStoreKey } from '../../hooks/store.hook';
import { SessionStoreKey as MainSessionStoreKey } from '../../hooks/session-store.hook';
import { BANK_TX_CACHE_PREFIX as MainBankTxPrefix } from '../../util/bank-tx-cache';
import { JobStatus as MainJobStatus } from '../../util/job';
import { BitcoinAddressType as MainBtcType, BitcoinAddressPrefix as MainBtcPrefix } from '../../config/key-path';
import {
  SumsubReviewAnswer as MainSumsubAnswer,
  SumsubReviewRejectType as MainSumsubReject,
} from '../../dto/sumsub.dto';
import { RecommendationStatus as MainRecStatus } from '../../dto/recommendation.dto';
import { StoreKey, SessionStoreKey, BANK_TX_CACHE_PREFIX } from '../lib/storage-keys';
import { JobStatus } from '../lib/job';
import { BitcoinAddressType, BitcoinAddressPrefix } from '../lib/key-path';
import { SumsubReviewAnswer, SumsubReviewRejectType, sumsubEnumValues } from '../lib/sumsub';
import { RecommendationStatus } from '../lib/recommendation';

/** Fails if either side has a member the other lacks, or if any mapped string differs. */
function expectSameStringRecord(copy: object, original: object): void {
  const copyMap = Object.fromEntries(Object.entries(copy));
  const originalMap = Object.fromEntries(Object.entries(original));
  expect(Object.keys(copyMap).sort()).toEqual(Object.keys(originalMap).sort());
  expect(Object.values(copyMap).sort()).toEqual(Object.values(originalMap).sort());
  for (const [key, value] of Object.entries(originalMap)) {
    expect(copyMap[key]).toBe(value);
  }
  for (const [key, value] of Object.entries(copyMap)) {
    expect(originalMap[key]).toBe(value);
  }
}

describe('App 2.0 copies of main-app contracts', () => {
  it('shares the same storage keys as the main app', () => {
    expectSameStringRecord({ ...StoreKey }, { ...MainStoreKey });
    expectSameStringRecord({ ...SessionStoreKey }, { ...MainSessionStoreKey });
    expect(BANK_TX_CACHE_PREFIX).toBe(MainBankTxPrefix);
  });

  it('shares the same job statuses', () => {
    expect({ ...JobStatus }).toEqual({ ...MainJobStatus });
  });

  it('shares the same bitcoin address types and prefixes', () => {
    expect({ ...BitcoinAddressType }).toEqual({ ...MainBtcType });
    expect({ ...BitcoinAddressPrefix }).toEqual({ ...MainBtcPrefix });
  });

  it('shares the same Sumsub review enums', () => {
    expect(SumsubReviewAnswer.GREEN).toBe('GREEN');
    expect(SumsubReviewAnswer.RED).toBe('RED');
    expect(SumsubReviewRejectType.FINAL).toBe('FINAL');
    expect(SumsubReviewRejectType.RETRY).toBe('RETRY');
    expect({ ...SumsubReviewAnswer }).toEqual({ ...MainSumsubAnswer });
    expect({ ...SumsubReviewRejectType }).toEqual({ ...MainSumsubReject });
    expect(sumsubEnumValues()).toEqual(['GREEN', 'RED', 'FINAL', 'RETRY']);
  });

  it('shares the same recommendation statuses', () => {
    expect({ ...RecommendationStatus }).toEqual({ ...MainRecStatus });
  });
});
