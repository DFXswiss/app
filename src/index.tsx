// Self-hosted Inter for the app, so no page of it loads a stylesheet or font from a third party.
// Imported here rather than in index.css, which the widget build shares: the widget copies no
// font files to /widget/ and keeps Google Fonts (Main.widget.tsx).
import '@fontsource-variable/inter';
import './index.css';
import reportWebVitals from './reportWebVitals';
import { startStandaloneApp } from './util/boot-standalone';

startStandaloneApp();
reportWebVitals();
