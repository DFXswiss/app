// Hook test for useRealunitReferral: the operator endpoints build the right URL/method/body
// and go through useGuardedApi (→ useApi). react-router's useNavigation is stubbed so renderHook
// works without a <Router> wrapper.
import { renderHook } from '@testing-library/react';

const mockCall = jest.fn();

jest.mock('@dfx.swiss/react', () => ({
  useApi: () => ({ call: mockCall }),
  TfaLevel: { STRICT: 'Strict' },
}));

jest.mock('../hooks/navigation.hook', () => ({
  useNavigation: () => ({ navigate: jest.fn() }),
}));

import { RealUnitPrizeWalletAlertAsset } from '../dto/realunit-referral.dto';
import { useRealunitReferral } from '../hooks/realunit-referral.hook';

describe('useRealunitReferral', () => {
  beforeEach(() => {
    mockCall.mockReset().mockResolvedValue(undefined);
  });

  it('lists relations', async () => {
    mockCall.mockResolvedValue([]);
    const { result } = renderHook(() => useRealunitReferral());

    await result.current.getRelations();

    expect(mockCall).toHaveBeenCalledWith({ url: 'realunit/referral/admin/relations', method: 'GET' });
  });

  it('approves a relation with a reason (PUT)', async () => {
    const { result } = renderHook(() => useRealunitReferral());

    await result.current.approveRelation(7, 'looks good');

    expect(mockCall).toHaveBeenCalledWith({
      url: 'realunit/referral/admin/relations/7/approve',
      method: 'PUT',
      data: { reason: 'looks good' },
    });
  });

  it('rejects a relation with a reason (PUT)', async () => {
    const { result } = renderHook(() => useRealunitReferral());

    await result.current.rejectRelation(8, 'suspicious');

    expect(mockCall).toHaveBeenCalledWith({
      url: 'realunit/referral/admin/relations/8/reject',
      method: 'PUT',
      data: { reason: 'suspicious' },
    });
  });

  it('awards a manual prize with a reason (POST)', async () => {
    const { result } = renderHook(() => useRealunitReferral());

    await result.current.createManualPrize(9, 'approved earlier');

    expect(mockCall).toHaveBeenCalledWith({
      url: 'realunit/referral/admin/relations/9/manual-prize',
      method: 'POST',
      data: { reason: 'approved earlier' },
    });
  });

  it('loads the prize wallet', async () => {
    mockCall.mockResolvedValue({ address: '0xprize', eth: 1.5, realu: 20 });
    const { result } = renderHook(() => useRealunitReferral());

    await expect(result.current.getPrizeWallet()).resolves.toEqual({ address: '0xprize', eth: 1.5, realu: 20 });
    expect(mockCall).toHaveBeenCalledWith({ url: 'realunit/referral/admin/prize-wallet', method: 'GET' });
  });

  it('lists prize-wallet alerts', async () => {
    mockCall.mockResolvedValue([]);
    const { result } = renderHook(() => useRealunitReferral());

    await result.current.listPrizeWalletAlerts();

    expect(mockCall).toHaveBeenCalledWith({ url: 'realunit/referral/admin/prize-wallet/alerts', method: 'GET' });
  });

  it('creates a prize-wallet alert', async () => {
    const { result } = renderHook(() => useRealunitReferral());
    const body = {
      asset: RealUnitPrizeWalletAlertAsset.ETH,
      threshold: 0.05,
      mail: 'ops@example.com',
    };

    await result.current.createPrizeWalletAlert(body);

    expect(mockCall).toHaveBeenCalledWith({
      url: 'realunit/referral/admin/prize-wallet/alerts',
      method: 'POST',
      data: body,
    });
  });

  it('soft-deletes a prize-wallet alert', async () => {
    const { result } = renderHook(() => useRealunitReferral());

    await result.current.deletePrizeWalletAlert(4);

    expect(mockCall).toHaveBeenCalledWith({
      url: 'realunit/referral/admin/prize-wallet/alerts/4/delete',
      method: 'PUT',
    });
  });

  it('lists promo codes', async () => {
    mockCall.mockResolvedValue([]);
    const { result } = renderHook(() => useRealunitReferral());

    await result.current.getPromoCodes();

    expect(mockCall).toHaveBeenCalledWith({ url: 'realunit/referral/promo', method: 'GET' });
  });

  it('creates a promo code', async () => {
    const { result } = renderHook(() => useRealunitReferral());
    const dto = {
      code: 'START2026',
      redemptionCap: 10,
      minBuyRealu: 200,
      validFrom: '2026-09-09T00:00:00.000Z',
      validUntil: '2026-12-31T23:59:59.000Z',
    };

    await result.current.createPromoCode(dto);

    expect(mockCall).toHaveBeenCalledWith({ url: 'realunit/referral/promo', method: 'POST', data: dto });
  });

  it('creates a promo-code batch', async () => {
    const { result } = renderHook(() => useRealunitReferral());
    const dto = {
      count: 300,
      prefix: 'MESSE',
      redemptionCap: 1,
      minBuyRealu: 200,
      validFrom: '2026-09-09T00:00:00.000Z',
      validUntil: '2026-12-31T23:59:59.999Z',
    };

    await result.current.createPromoCodes(dto);

    expect(mockCall).toHaveBeenCalledWith({ url: 'realunit/referral/promo/batch', method: 'POST', data: dto });
  });

  it('deactivates a promo code', async () => {
    const { result } = renderHook(() => useRealunitReferral());

    await result.current.deactivatePromoCode(3);

    expect(mockCall).toHaveBeenCalledWith({ url: 'realunit/referral/promo/3/deactivate', method: 'PUT' });
  });

  it('activates a promo code', async () => {
    const { result } = renderHook(() => useRealunitReferral());

    await result.current.activatePromoCode(3);

    expect(mockCall).toHaveBeenCalledWith({ url: 'realunit/referral/promo/3/activate', method: 'PUT' });
  });

  it('updates a promo code', async () => {
    const { result } = renderHook(() => useRealunitReferral());
    const dto = {
      code: 'NEW2026',
      redemptionCap: 80,
      minBuyRealu: 200,
      validFrom: '2026-09-09T00:00:00.000Z',
      validUntil: '2026-12-31T23:59:59.999Z',
    };

    await result.current.updatePromoCode(3, dto);

    expect(mockCall).toHaveBeenCalledWith({ url: 'realunit/referral/promo/3', method: 'PUT', data: dto });
  });

  it('lists admin payouts', async () => {
    mockCall.mockResolvedValue([]);
    const { result } = renderHook(() => useRealunitReferral());

    await result.current.getAdminPayouts();

    expect(mockCall).toHaveBeenCalledWith({ url: 'realunit/referral/admin/payouts', method: 'GET' });
  });
});
