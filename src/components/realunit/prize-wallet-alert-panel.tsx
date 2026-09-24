import { StyledButton, StyledButtonColor, StyledButtonSize, StyledButtonWidth } from '@dfx.swiss/react-components';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { ErrorHint } from 'src/components/error-hint';
import { RealUnitPrizeWalletAlert, RealUnitPrizeWalletAlertAsset } from 'src/dto/realunit-referral.dto';
import { useRealunitReferral } from 'src/hooks/realunit-referral.hook';

interface PrizeWalletAlertPanelProps {
  translate: (ns: string, key: string) => string;
}

function isThresholdValid(asset: RealUnitPrizeWalletAlertAsset, raw: string): boolean {
  const value = Number(raw);
  if (asset === RealUnitPrizeWalletAlertAsset.ETH) {
    return Number.isFinite(value) && value > 0;
  }
  return Number.isInteger(value) && value >= 1;
}

/** One address only: no commas/semicolons/whitespace lists; exactly one @; non-empty local and domain (a@b min). */
function isMailValid(value: string): boolean {
  if (!value || value.includes(',') || value.includes(';') || /\s/.test(value)) return false;
  const at = value.indexOf('@');
  if (at <= 0 || at !== value.lastIndexOf('@') || at === value.length - 1) return false;
  return true;
}

export function RealunitPrizeWalletAlertPanel({ translate }: PrizeWalletAlertPanelProps): JSX.Element {
  const { listPrizeWalletAlerts, createPrizeWalletAlert, deletePrizeWalletAlert } = useRealunitReferral();

  const [alerts, setAlerts] = useState<RealUnitPrizeWalletAlert[]>([]);
  const [listError, setListError] = useState<string>();
  const [formError, setFormError] = useState<string>();
  const [actionError, setActionError] = useState<string>();
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [deletingIds, setDeletingIds] = useState<Set<number>>(new Set());
  const isSubmittingRef = useRef(false);
  const deactivatingIdsRef = useRef<Set<number>>(new Set());
  const loadGenRef = useRef(0);

  const [asset, setAsset] = useState<RealUnitPrizeWalletAlertAsset>(RealUnitPrizeWalletAlertAsset.ETH);
  const [threshold, setThreshold] = useState('');
  const [mail, setMail] = useState('');

  useEffect(() => {
    loadAlerts();
  }, []);

  function loadAlerts(): void {
    const gen = ++loadGenRef.current;
    setIsLoading(true);
    setListError(undefined);
    listPrizeWalletAlerts()
      .then((rows) => {
        if (gen !== loadGenRef.current) return;
        setAlerts(rows);
      })
      .catch((e: Error) => {
        if (gen !== loadGenRef.current) return;
        setAlerts([]);
        setListError(e.message ?? 'Unknown error');
      })
      .finally(() => {
        if (gen !== loadGenRef.current) return;
        setIsLoading(false);
      });
  }

  const trimmedMail = mail.trim();
  const canSubmit = !isLoading && isThresholdValid(asset, threshold) && isMailValid(trimmedMail);

  function resetForm(): void {
    setAsset(RealUnitPrizeWalletAlertAsset.ETH);
    setThreshold('');
    setMail('');
  }

  function onSubmit(event?: FormEvent): void {
    event?.preventDefault();
    if (isSubmittingRef.current) return;
    if (isLoading || !isThresholdValid(asset, threshold) || !isMailValid(trimmedMail)) return;
    isSubmittingRef.current = true;
    setIsSubmitting(true);
    setFormError(undefined);
    setActionError(undefined);
    createPrizeWalletAlert({
      asset,
      threshold: Number(threshold),
      mail: trimmedMail,
    })
      .then((created) => {
        loadGenRef.current += 1;
        setListError(undefined);
        setActionError(undefined);
        setAlerts((prev) => [created, ...prev]);
        resetForm();
        setShowForm(false);
      })
      .catch((e: Error) => setFormError(e.message ?? 'Unknown error'))
      .finally(() => {
        isSubmittingRef.current = false;
        setIsSubmitting(false);
      });
  }

  function onDelete(id: number): void {
    if (deactivatingIdsRef.current.has(id)) return;
    deactivatingIdsRef.current.add(id);
    setDeletingIds(new Set(deactivatingIdsRef.current));
    setActionError(undefined);
    deletePrizeWalletAlert(id)
      .then(() => setAlerts((prev) => prev.filter((row) => row.id !== id)))
      .catch((e: Error) => setActionError(e.message ?? 'Unknown error'))
      .finally(() => {
        deactivatingIdsRef.current.delete(id);
        setDeletingIds(new Set(deactivatingIdsRef.current));
      });
  }

  const isRealu = asset === RealUnitPrizeWalletAlertAsset.REALU;

  return (
    <div className="bg-white rounded-lg shadow-sm p-4 flex flex-col gap-4 text-left w-full min-w-0">
      <StyledButton
        label={translate('screens/referral', 'Notify on low balance')}
        onClick={() => setShowForm((open) => !open)}
        size={StyledButtonSize.SMALL}
        width={StyledButtonWidth.MIN}
        color={StyledButtonColor.BLUE}
        deactivateMargin
        caps={false}
        className="self-start"
        disabled={isLoading}
      />

      {showForm && (
        <form className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end" onSubmit={onSubmit}>
          <label className="flex flex-col gap-1 text-sm text-dfxBlue-800">
            {translate('screens/referral', 'Asset')}
            <select
              className="h-10 border border-dfxGray-400 rounded-md px-3 bg-white"
              value={asset}
              onChange={(e) => setAsset(e.target.value as RealUnitPrizeWalletAlertAsset)}
            >
              <option value={RealUnitPrizeWalletAlertAsset.ETH}>{translate('screens/referral', 'ETH')}</option>
              <option value={RealUnitPrizeWalletAlertAsset.REALU}>{translate('screens/referral', 'REALU')}</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm text-dfxBlue-800">
            {translate('screens/referral', 'Threshold')}
            <input
              className="h-10 border border-dfxGray-400 rounded-md px-3 bg-white"
              type="number"
              step={isRealu ? 1 : 'any'}
              min={isRealu ? 1 : undefined}
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-dfxBlue-800">
            {translate('screens/referral', 'Mail')}
            <input
              className="h-10 border border-dfxGray-400 rounded-md px-3 bg-white"
              type="email"
              value={mail}
              onChange={(e) => setMail(e.target.value)}
              autoComplete="off"
            />
          </label>
          <StyledButton
            label={translate('screens/referral', 'Submit')}
            onClick={() => onSubmit()}
            size={StyledButtonSize.SMALL}
            width={StyledButtonWidth.MIN}
            color={StyledButtonColor.BLUE}
            deactivateMargin
            caps={false}
            className="justify-self-start h-10"
            disabled={!canSubmit}
            isLoading={isSubmitting}
          />
        </form>
      )}
      {formError && <ErrorHint message={formError} />}

      {isLoading && <div data-testid="prize-wallet-alert-loading">{translate('screens/referral', 'Loading')}</div>}
      {listError && !isLoading && (
        <>
          <ErrorHint message={listError} />
          <StyledButton
            label={translate('general/actions', 'Retry')}
            onClick={loadAlerts}
            size={StyledButtonSize.SMALL}
            width={StyledButtonWidth.MIN}
            color={StyledButtonColor.BLUE}
            deactivateMargin
            caps={false}
            className="self-start"
            disabled={isSubmitting}
          />
        </>
      )}
      {actionError && <ErrorHint message={actionError} />}
      {alerts.length > 0 && (
        <div className="overflow-auto">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-dfxGray-300">
              <tr>
                <th className="px-3 py-2 text-left font-semibold text-dfxBlue-800">
                  {translate('screens/referral', 'Asset')}
                </th>
                <th className="px-3 py-2 text-left font-semibold text-dfxBlue-800">
                  {translate('screens/referral', 'Threshold')}
                </th>
                <th className="px-3 py-2 text-left font-semibold text-dfxBlue-800">
                  {translate('screens/referral', 'Mail')}
                </th>
                <th className="px-3 py-2 text-left font-semibold text-dfxBlue-800" />
              </tr>
            </thead>
            <tbody>
              {alerts.map((row) => (
                <tr key={row.id} className="border-b border-dfxGray-300">
                  <td className="px-3 py-2 text-dfxBlue-800">{row.asset}</td>
                  <td className="px-3 py-2 text-dfxBlue-800">{row.threshold}</td>
                  <td className="px-3 py-2 text-dfxBlue-800 break-all">{row.mail}</td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      className={`text-dfxRed-100 underline text-sm${deletingIds.has(row.id) ? ' opacity-50' : ''}`}
                      aria-disabled={deletingIds.has(row.id)}
                      onClick={() => onDelete(row.id)}
                    >
                      {translate('general/actions', 'Delete')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
