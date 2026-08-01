import ReactDOM from 'react-dom/client';
import MainPartner from './Main.partner';
import { setupLanguages } from './translations';
import './index.css';

// Same i18n bootstrap as the main app (English keys + de/fr/it files; LanguageDetector).
setupLanguages();

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(<MainPartner />);
