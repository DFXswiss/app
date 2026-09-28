import { SpinnerSize, StyledButton, StyledButtonWidth, StyledLoadingSpinner } from '@dfx.swiss/react-components';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { ErrorHint } from 'src/components/error-hint';
import { PromoQrDialog } from 'src/components/realunit/promo-qr-dialog';
import { RealUnitPromoCode } from 'src/dto/realunit-referral.dto';
import { useRealunitReferral } from 'src/hooks/realunit-referral.hook';
import { promoLandingUrl } from 'src/util/promo-landing-url';

interface PromoPanelProps {
  translate: (ns: string, key: string) => string;
}

export function RealunitPromoPanel({ translate }: PromoPanelProps): JSX.Element {
  const { getPromoCodes, createPromoCode, createPromoCodes, deactivatePromoCode, activatePromoCode, updatePromoCode } =
    useRealunitReferral();

  const [codes, setCodes] = useState<RealUnitPromoCode[]>([]);
  const [listError, setListError] = useState<string>();
  const [formError, setFormError] = useState<string>();
  const [actionError, setActionError] = useState<string>();
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deactivatingIds, setDeactivatingIds] = useState<Set<number>>(new Set());
  const [activatingIds, setActivatingIds] = useState<Set<number>>(new Set());
  const [savingIds, setSavingIds] = useState<Set<number>>(new Set());
  const isSubmittingRef = useRef(false);
  const deactivatingIdsRef = useRef<Set<number>>(new Set());
  const activatingIdsRef = useRef<Set<number>>(new Set());
  const savingIdsRef = useRef<Set<number>>(new Set());

  const [code, setCode] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [redemptionCap, setRedemptionCap] = useState('');
  const [minBuyRealu, setMinBuyRealu] = useState('200');
  const [validFrom, setValidFrom] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [qrCode, setQrCode] = useState<string>();

  const [editingId, setEditingId] = useState<number>();
  const [editCode, setEditCode] = useState('');
  const [editCap, setEditCap] = useState('');
  const [editMinBuy, setEditMinBuy] = useState('');
  const [editValidFrom, setEditValidFrom] = useState('');
  const [editValidUntil, setEditValidUntil] = useState('');

  useEffect(() => {
    loadCodes();
  }, []);

  function loadCodes(): void {
    setIsLoading(true);
    setListError(undefined);
    getPromoCodes()
      .then(setCodes)
      .catch((e: Error) => {
        setCodes([]);
        setListError(e.message ?? 'Unknown error');
      })
      .finally(() => setIsLoading(false));
  }

  const cap = Number(redemptionCap);
  const minBuy = Number(minBuyRealu);
  const qty = Number(quantity);
  const isBatch = Number.isInteger(qty) && qty > 1;
  const canSubmit =
    !isLoading &&
    !listError &&
    Number.isInteger(qty) &&
    qty >= 1 &&
    qty <= 500 &&
    (isBatch || code.trim().length > 0) &&
    Number.isInteger(cap) &&
    cap >= 1 &&
    Number.isInteger(minBuy) &&
    minBuy >= 1 &&
    validFrom.length > 0 &&
    validUntil.length > 0 &&
    validUntil >= validFrom;

  function canSaveRow(row: RealUnitPromoCode): boolean {
    const saveCap = Number(editCap);
    const saveMinBuy = Number(editMinBuy);
    return (
      editCode.trim().length > 0 &&
      Number.isInteger(saveCap) &&
      saveCap >= 1 &&
      Number.isInteger(saveMinBuy) &&
      saveMinBuy >= 1 &&
      saveCap >= (row.redemptionCount ?? 0) &&
      editValidFrom.length > 0 &&
      editValidUntil.length > 0 &&
      editValidUntil >= editValidFrom
    );
  }

  function onSubmit(event?: FormEvent): void {
    event?.preventDefault();
    if (isSubmittingRef.current) return;
    if (!canSubmit) return;
    isSubmittingRef.current = true;
    setIsSubmitting(true);
    setFormError(undefined);
    const dates = {
      redemptionCap: cap,
      minBuyRealu: minBuy,
      validFrom: new Date(`${validFrom}T00:00:00.000Z`).toISOString(),
      validUntil: new Date(`${validUntil}T23:59:59.999Z`).toISOString(),
    };
    const request = isBatch
      ? createPromoCodes({
          count: qty,
          prefix: code.trim() || undefined,
          ...dates,
        })
      : createPromoCode({ code: code.trim(), ...dates }).then((created) => [created]);
    request
      .then((created) => {
        setListError(undefined);
        setCodes((prev) => [...created, ...prev]);
        setCode('');
        setQuantity('1');
        setRedemptionCap('');
        setMinBuyRealu('200');
        setValidFrom('');
        setValidUntil('');
      })
      .catch((e: Error) => setFormError(e.message ?? 'Unknown error'))
      .finally(() => {
        isSubmittingRef.current = false;
        setIsSubmitting(false);
      });
  }

  function onDeactivate(id: number): void {
    if (deactivatingIdsRef.current.has(id)) return;
    deactivatingIdsRef.current.add(id);
    setDeactivatingIds(new Set(deactivatingIdsRef.current));
    setActionError(undefined);
    deactivatePromoCode(id)
      .then(() =>
        setCodes((prev) =>
          prev.map((row) => (row.id === id ? { ...row, deactivatedAt: new Date().toISOString() } : row)),
        ),
      )
      .catch((e: Error) => setActionError(e.message ?? 'Unknown error'))
      .finally(() => {
        deactivatingIdsRef.current.delete(id);
        setDeactivatingIds(new Set(deactivatingIdsRef.current));
      });
  }

  function onActivate(id: number): void {
    if (activatingIdsRef.current.has(id)) return;
    activatingIdsRef.current.add(id);
    setActivatingIds(new Set(activatingIdsRef.current));
    setActionError(undefined);
    activatePromoCode(id)
      .then((updated) => setCodes((prev) => prev.map((row) => (row.id === id ? updated : row))))
      .catch((e: Error) => setActionError(e.message ?? 'Unknown error'))
      .finally(() => {
        activatingIdsRef.current.delete(id);
        setActivatingIds(new Set(activatingIdsRef.current));
      });
  }

  function onEdit(row: RealUnitPromoCode): void {
    setEditingId(row.id);
    setEditCode(row.code);
    setEditCap(String(row.redemptionCap));
    setEditMinBuy(String(row.minBuyRealu));
    setEditValidFrom(row.validFrom.slice(0, 10));
    setEditValidUntil(row.validUntil.slice(0, 10));
  }

  function onCancel(): void {
    setEditingId(undefined);
  }

  function onSave(row: RealUnitPromoCode): void {
    if (savingIdsRef.current.has(row.id)) return;
    if (!canSaveRow(row)) return;
    savingIdsRef.current.add(row.id);
    setSavingIds(new Set(savingIdsRef.current));
    setActionError(undefined);
    updatePromoCode(row.id, {
      code: editCode.trim(),
      redemptionCap: Number(editCap),
      minBuyRealu: Number(editMinBuy),
      validFrom: new Date(`${editValidFrom}T00:00:00.000Z`).toISOString(),
      validUntil: new Date(`${editValidUntil}T23:59:59.999Z`).toISOString(),
    })
      .then((updated) => {
        setCodes((prev) => prev.map((item) => (item.id === row.id ? updated : item)));
        setEditingId(undefined);
      })
      .catch((e: Error) => setActionError(e.message ?? 'Unknown error'))
      .finally(() => {
        savingIdsRef.current.delete(row.id);
        setSavingIds(new Set(savingIdsRef.current));
      });
  }

  return (
    <div className="bg-white rounded-lg shadow-sm p-4 flex flex-col gap-4 text-left">
      <h2 className="text-dfxGray-700">{translate('screens/referral', 'Start promo code')}</h2>
      <form className="grid grid-cols-1 md:grid-cols-2 gap-3 items-end" onSubmit={onSubmit}>
        <label className="flex flex-col gap-1 text-sm text-dfxBlue-800">
          {translate('screens/referral', 'Quantity')}
          <input
            className="border border-dfxGray-400 rounded px-2 py-1"
            type="number"
            min={1}
            max={500}
            step={1}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-dfxBlue-800">
          {isBatch ? translate('screens/referral', 'Prefix (optional)') : translate('screens/referral', 'Code')}
          <input
            className="border border-dfxGray-400 rounded px-2 py-1"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            maxLength={isBatch ? 64 : 256}
            autoComplete="off"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-dfxBlue-800">
          {translate('screens/referral', 'Redemption cap')}
          <input
            className="border border-dfxGray-400 rounded px-2 py-1"
            type="number"
            min={1}
            step={1}
            value={redemptionCap}
            onChange={(e) => setRedemptionCap(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-dfxBlue-800">
          {translate('screens/referral', 'Minimum buy (REALU)')}
          <input
            className="border border-dfxGray-400 rounded px-2 py-1"
            type="number"
            min={1}
            step={1}
            value={minBuyRealu}
            onChange={(e) => setMinBuyRealu(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-dfxBlue-800">
          {translate('screens/referral', 'Valid from')}
          <input
            className="border border-dfxGray-400 rounded px-2 py-1"
            type="date"
            value={validFrom}
            onChange={(e) => setValidFrom(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-dfxBlue-800">
          {translate('screens/referral', 'Valid until')}
          <input
            className="border border-dfxGray-400 rounded px-2 py-1"
            type="date"
            value={validUntil}
            onChange={(e) => setValidUntil(e.target.value)}
          />
        </label>
        <StyledButton
          label={translate('screens/referral', 'Start')}
          onClick={() => onSubmit()}
          width={StyledButtonWidth.MIN}
          disabled={!canSubmit}
          isLoading={isSubmitting}
        />
      </form>
      {formError && <ErrorHint message={formError} />}

      <h3 className="text-dfxGray-700 text-sm font-semibold">{translate('screens/referral', 'Promo codes')}</h3>
      {isLoading && <StyledLoadingSpinner size={SpinnerSize.SM} />}
      {listError && <ErrorHint message={listError} />}
      {actionError && <ErrorHint message={actionError} />}
      {!listError && !isLoading && codes.length === 0 && (
        <p className="text-sm text-dfxGray-700">{translate('screens/referral', 'No promo codes yet')}</p>
      )}
      {codes.length > 0 && (
        <div className="overflow-auto">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-dfxGray-300">
              <tr>
                <th className="px-3 py-2 text-left font-semibold text-dfxBlue-800">
                  {translate('screens/referral', 'Code')}
                </th>
                <th className="px-3 py-2 text-left font-semibold text-dfxBlue-800">
                  {translate('screens/referral', 'Redemption cap')}
                </th>
                <th className="px-3 py-2 text-left font-semibold text-dfxBlue-800">
                  {translate('screens/referral', 'Redeemed')}
                </th>
                <th className="px-3 py-2 text-left font-semibold text-dfxBlue-800">
                  {translate('screens/referral', 'Minimum buy (REALU)')}
                </th>
                <th className="px-3 py-2 text-left font-semibold text-dfxBlue-800">
                  {translate('screens/referral', 'Valid from')}
                </th>
                <th className="px-3 py-2 text-left font-semibold text-dfxBlue-800">
                  {translate('screens/referral', 'Valid until')}
                </th>
                <th className="px-3 py-2 text-left font-semibold text-dfxBlue-800">
                  {translate('screens/referral', 'Landing link')}
                </th>
                <th className="px-3 py-2 text-left font-semibold text-dfxBlue-800">
                  {translate('screens/referral', 'QR code')}
                </th>
                <th className="px-3 py-2 text-left font-semibold text-dfxBlue-800" />
              </tr>
            </thead>
            <tbody>
              {codes.map((row) => {
                const isEditing = editingId === row.id;
                return (
                  <tr key={row.id} className="border-b border-dfxGray-300">
                    <td className="px-3 py-2 text-dfxBlue-800 break-all">
                      {isEditing ? (
                        <input
                          className="border border-dfxGray-400 rounded px-2 py-1"
                          value={editCode}
                          onChange={(e) => setEditCode(e.target.value)}
                          maxLength={256}
                          autoComplete="off"
                        />
                      ) : (
                        row.code
                      )}
                    </td>
                    <td className="px-3 py-2 text-dfxBlue-800">
                      {isEditing ? (
                        <input
                          className="border border-dfxGray-400 rounded px-2 py-1"
                          type="number"
                          min={1}
                          step={1}
                          value={editCap}
                          onChange={(e) => setEditCap(e.target.value)}
                        />
                      ) : (
                        row.redemptionCap
                      )}
                    </td>
                    <td className="px-3 py-2 text-dfxBlue-800">{String(row.redemptionCount ?? 0)}</td>
                    <td className="px-3 py-2 text-dfxBlue-800">
                      {isEditing ? (
                        <input
                          className="border border-dfxGray-400 rounded px-2 py-1"
                          type="number"
                          min={1}
                          step={1}
                          value={editMinBuy}
                          onChange={(e) => setEditMinBuy(e.target.value)}
                        />
                      ) : (
                        row.minBuyRealu
                      )}
                    </td>
                    <td className="px-3 py-2 text-dfxBlue-800">
                      {isEditing ? (
                        <input
                          className="border border-dfxGray-400 rounded px-2 py-1"
                          type="date"
                          value={editValidFrom}
                          onChange={(e) => setEditValidFrom(e.target.value)}
                        />
                      ) : (
                        row.validFrom.slice(0, 10)
                      )}
                    </td>
                    <td className="px-3 py-2 text-dfxBlue-800">
                      {isEditing ? (
                        <input
                          className="border border-dfxGray-400 rounded px-2 py-1"
                          type="date"
                          value={editValidUntil}
                          onChange={(e) => setEditValidUntil(e.target.value)}
                        />
                      ) : (
                        row.validUntil.slice(0, 10)
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <a
                        className="text-dfxBlue-800 underline break-all"
                        href={promoLandingUrl(row.code)}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {promoLandingUrl(row.code)}
                      </a>
                    </td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        className="text-dfxBlue-800 underline text-sm"
                        onClick={() => setQrCode(row.code)}
                      >
                        {translate('screens/referral', 'View QR code')}
                      </button>
                    </td>
                    <td className="px-3 py-2">
                      {isEditing ? (
                        <>
                          <button
                            type="button"
                            className={`text-dfxBlue-800 underline text-sm${savingIds.has(row.id) ? ' opacity-50' : ''}`}
                            disabled={!canSaveRow(row)}
                            aria-disabled={savingIds.has(row.id) || !canSaveRow(row)}
                            onClick={() => onSave(row)}
                          >
                            {translate('screens/referral', 'Save')}
                          </button>
                          <button
                            type="button"
                            className="text-dfxBlue-800 underline text-sm"
                            onClick={onCancel}
                          >
                            {translate('screens/referral', 'Cancel')}
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="text-dfxBlue-800 underline text-sm"
                            onClick={() => onEdit(row)}
                          >
                            {translate('screens/referral', 'Edit')}
                          </button>
                          {row.deactivatedAt ? (
                            <>
                              <span className="text-dfxGray-700">{translate('screens/referral', 'Deactivated')}</span>
                              <button
                                type="button"
                                className={`text-dfxBlue-800 underline text-sm${activatingIds.has(row.id) ? ' opacity-50' : ''}`}
                                aria-disabled={activatingIds.has(row.id)}
                                onClick={() => onActivate(row.id)}
                              >
                                {translate('screens/referral', 'Activate')}
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              className={`text-dfxRed-100 underline text-sm${deactivatingIds.has(row.id) ? ' opacity-50' : ''}`}
                              aria-disabled={deactivatingIds.has(row.id)}
                              onClick={() => onDeactivate(row.id)}
                            >
                              {translate('screens/referral', 'Deactivate')}
                            </button>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {qrCode && (
        <PromoQrDialog
          code={qrCode}
          url={promoLandingUrl(qrCode)}
          translate={translate}
          onClose={() => setQrCode(undefined)}
        />
      )}
    </div>
  );
}
