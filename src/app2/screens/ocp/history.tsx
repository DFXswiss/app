// DFX App 2.0 — OpenCryptoPay » Payment history sub-view.
// Faithful port of the static preview's ocpHistoryHtml (index.html ~2582-2588)
// + wireHistory (2589): the "total received" tile followed by a per-payment
// list, sourced from GET /paymentLink/history (loaded by useOcp.loadHistory).
// wireHistory was a no-op in the static app — the list is render-only — so the
// only behaviour beyond rendering is triggering the load once when history is
// still null (mirroring the static app's single global OCP.history object).

import { useEffect } from 'react';
import { useT } from '../../i18n';
import { formatNumber } from '../parts/format';
import { paymentStatusLabel } from './links';
import type { OcpHistoryItem, OcpSubViewProps } from './useOcp';
import { cx } from '../../css';

// Status glyphs, ported verbatim from the static app: CHECK_SVG (Completed),
// an inline clock (Pending), and an X (Cancelled / Expired / anything else).
function StatusIcon({ status }: { status: string }) {
  if (status === 'Completed') {
    return (
      <svg viewBox="0 0 24 24" fill="none">
        <path
          d="M5 12.5l4.5 4.5L19 7"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (status === 'Pending') {
    return (
      <svg viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.8" />
        <path d="M12 8v4l3 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none">
      <path d="M8 8l8 8M16 8l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

// Mirrors the static app's payChip(): Completed → act, Pending → pend, else ina.
function statusChipClass(status: string): string {
  if (status === 'Completed') return 'act';
  if (status === 'Pending') return 'pend';
  return 'ina';
}

export default function HistoryView({ ocp }: OcpSubViewProps) {
  const { t, language } = useT();
  const { history, historyError, loadHistory } = ocp;

  useEffect(() => {
    if (history === null) void loadHistory();
  }, [history, loadHistory]);

  if (history === null) {
    return (
      <div className={cx('ocp-empty')}>
        <span className={cx('spin')} />
      </div>
    );
  }

  const total = Math.round(history.total * 100) / 100;

  return (
    <>
      <div className={cx('limit-now')} style={{ marginBottom: 12 }}>
        <div className={cx('lab')}>{t('totalReceived')}</div>
        <div className={cx('big')}>{formatNumber(total, language)} CHF</div>
      </div>
      {history.items.length === 0 ? (
        historyError ? (
          <div className={cx('ocp-empty')} style={{ flexDirection: 'column', gap: 12, textAlign: 'center' }}>
            <span>{t('loadFail')}</span>
            <button
              type="button"
              className={cx('btn-mini')}
              style={{ width: 'auto' }}
              onClick={() => void loadHistory()}
            >
              {t('retry')}
            </button>
          </div>
        ) : (
          <div className={cx('ocp-empty')}>{t('historyEmpty')}</div>
        )
      ) : (
        <div className={cx('glass')} style={{ borderRadius: 18, overflow: 'hidden' }}>
          {history.items.map((p: OcpHistoryItem) => (
            <div className={cx('hrow')} key={p.id}>
              <span className={cx('hic', p.status)}>
                <StatusIcon status={p.status} />
              </span>
              <span className={cx('htx')}>
                <b>{p.note || t('ocpPayment')}</b>
                <small>{p.when || ''}</small>
              </span>
              <span className={cx('hamt')}>
                <b>{`${p.currency || ''} ${p.amount}`}</b>
                <span className={cx('pill-chip', statusChipClass(p.status))}>{paymentStatusLabel(t, p.status)}</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
