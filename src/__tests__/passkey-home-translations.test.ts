import de from '../translations/languages/de.json';
import fr from '../translations/languages/fr.json';
import italian from '../translations/languages/it.json';

it('keeps the home translation keys aligned across German, French and Italian', () => {
  const keys = (translation: { 'screens/home': Record<string, string> }) =>
    Object.keys(translation['screens/home']).sort();
  expect(keys(fr)).toEqual(keys(de));
  expect(keys(italian)).toEqual(keys(de));
});
