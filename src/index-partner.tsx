import ReactDOM from 'react-dom/client';
import MainPartner from './Main.partner';
import { applyStoredPartnerLanguage } from './partner-dashboard/util/i18n';
import { setupLanguages } from './translations';
import './index.css';

// Init i18n first. applyStoredPartnerLanguage must run after setupLanguages —
// changeLanguage before init throws (toResolveHierarchy) and aborts the entry.
setupLanguages();
applyStoredPartnerLanguage();

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(<MainPartner />);
