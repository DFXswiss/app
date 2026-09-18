// DFX App 2.0 — shared "connect first" state for the secondary screens
// (account/transactions/kyc/support). None of these views exist in the
// static preview for a signed-out visitor (the nav items that open them are
// hidden until a wallet is connected — see Shell's `leftBtn`), but this app
// is reachable by direct/refreshed hash URL, so every screen needs a real
// fallback instead of crashing on `undefined` user data.

import { useT } from '../../i18n';
import { useWalletSession } from '../../wallets/session';
import { cx } from '../../css';

export function LoggedOutState({ title }: { title: string }) {
  const { t } = useT();
  const { openConnect } = useWalletSession();

  return (
    <div className={cx('account')}>
      <div className={cx('txhead')}>
        <h2>{title}</h2>
      </div>
      <p className={cx('tnote')} style={{ padding: '0 4px 18px' }}>
        {t('connectToContinue')}
      </p>
      <button className={cx('btn-primary')} onClick={() => openConnect()}>
        <span>{t('connect')}</span>
      </button>
    </div>
  );
}
