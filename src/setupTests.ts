// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';
import { configure } from '@testing-library/react';
import i18n from 'i18next';
import { setupLanguages } from './translations';

// Jest defaults to maxWorkers = CPU cores - 1 (17 workers on 18 cores); under that load a
// worker can go without CPU time for over a second at times.
// Measured findBy* waits across 10 full suite runs (50 samples): median 278ms, maximum 1523ms;
// 7 of 50 exceeded 1000ms (DOM Testing Library's default async timeout). This does not weaken
// any assertion: every assertion still checks exactly the same condition, and a genuinely
// broken expectation still fails — this setting only gives the scheduler the time it needs.
// Applies to the whole suite, not only the file where the flakiness was first noticed.
configure({ asyncUtilTimeout: 5000 });

// Must stay above asyncUtilTimeout so Jest does not abort first and replace Testing Library's
// informative DOM dump (e.g. "Unable to find role=button …") with a bare "Exceeded timeout of
// 5000 ms" and no diagnostic detail. react-scripts does not accept testTimeout in the jest
// section of package.json (supportedKeys in createJestConfig.js omits it), so set it here.
jest.setTimeout(15000);


// Partner dashboard (and any useTranslation consumer) needs the same i18n init as the app.
// Force English so tests assert on the English base keys/defaults, not the host browser language.
setupLanguages();
void i18n.changeLanguage('en');
