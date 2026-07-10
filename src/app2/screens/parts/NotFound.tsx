// DFX App 2.0 — catch-all route (finding #7).
//
// A hard-load of an unmatched hash path (e.g. /app2/#/nonsense) previously fell straight
// through react-router-dom's own "Unexpected Application Error!" page — unbranded, no Shell, no
// way back. This renders inside the Shell like every other screen (registered as App.tsx's `*`
// route), reusing the same `.account`/`.txhead`/`.tnote`/`.btn-primary` classes ScreenPlaceholder
// (components/ui.tsx) uses for its own full-screen views.

import { useNavigate } from 'react-router-dom';
import { useT } from '../../i18n';

export function NotFound() {
  const { t } = useT();
  const navigate = useNavigate();

  return (
    <div className="account">
      <div className="txhead">
        <h2>{t('notFoundTitle')}</h2>
      </div>
      <p className="tnote" style={{ padding: '0 4px 8px' }}>
        {t('notFoundBody')}
      </p>
      <button className="btn-primary" style={{ margin: '8px 4px 0' }} onClick={() => navigate('/', { replace: true })}>
        <span>{t('backHome')}</span>
      </button>
    </div>
  );
}
