// Covers only the screens/home key for a rejected automatic address switch in de/fr/it.
// Full language-file parity across every key is intentionally out of scope for this change.

import de from 'src/translations/languages/de.json';
import fr from 'src/translations/languages/fr.json';
import itLang from 'src/translations/languages/it.json';

const KEY = 'This address could not be selected. Please use another address or contact our support.' as const;

const languages: Record<'de' | 'fr' | 'it', { 'screens/home': Record<string, string> }> = {
  de: de as { 'screens/home': Record<string, string> },
  fr: fr as { 'screens/home': Record<string, string> },
  it: itLang as { 'screens/home': Record<string, string> },
};

const EXPECTED: Record<'de' | 'fr' | 'it', string> = {
  de: 'Diese Adresse konnte nicht ausgewählt werden. Bitte verwende eine andere Adresse oder wende Dich an unseren Support.',
  fr: "Cette adresse n'a pas pu être sélectionnée. Veuillez utiliser une autre adresse ou contacter notre service d'assistance.",
  it: 'Non è stato possibile selezionare questo indirizzo. Utilizzare un altro indirizzo o contattare il nostro supporto.',
};

describe('address switch rejection translations', () => {
  it.each(Object.keys(languages) as Array<'de' | 'fr' | 'it'>)(
    'defines the exact translated rejection sentence in screens/home for %s',
    (lang) => {
      const home = languages[lang]['screens/home'];

      // Keys contain periods — always index the object directly, never split on '.'.
      expect(home[KEY]).toBe(EXPECTED[lang]);
    },
  );
});
