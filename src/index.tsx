import ReactDOM from 'react-dom/client';
import { StoreKey } from './hooks/store.hook';
import Main from './Main';
import './index.css';
import reportWebVitals from './reportWebVitals';
import { installChunkErrorHandling } from './util/client-error';

// Clear session data when URL contains new login credentials
// This must happen BEFORE React initializes to prevent the @dfx.swiss/react
// package from loading a stale session from storage
// Only clear session-related keys, preserve user preferences (language, etc.)
// StoreKey is a value import of a string enum from store.hook.ts; that module
// has no runtime React / @dfx.swiss/react import and no module-level storage
// read, so evaluating it here does not load a stale session.
const urlParams = new URLSearchParams(window.location.search);
if ((urlParams.has('address') && urlParams.has('signature')) || urlParams.has('session')) {
  localStorage.removeItem(StoreKey.AUTH_TOKEN);
  localStorage.removeItem(StoreKey.ACTIVE_WALLET);
  localStorage.removeItem(StoreKey.QUERY_PARAMS);
  sessionStorage.clear();
}

installChunkErrorHandling();

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(<Main />);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
