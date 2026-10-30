import de from 'src/translations/languages/de.json';
import fr from 'src/translations/languages/fr.json';
import itLang from 'src/translations/languages/it.json';

type SupportTranslations = { 'screens/support': Record<string, string> };

const NAME_ONLY_WARNING = 'Tickets assigned only by name may be missing from this list.';
const NO_CLERKS_AVAILABLE = 'No support clerks are available.';

const EXPECTED: Record<string, [SupportTranslations, Record<string, string>]> = {
  de: [
    de as SupportTranslations,
    {
      [NAME_ONLY_WARNING]: 'Tickets, die nur per Name zugeordnet sind, fehlen möglicherweise in dieser Liste.',
      [NO_CLERKS_AVAILABLE]: 'Keine Support-Bearbeiter sind verfügbar.',
    },
  ],
  fr: [
    fr as SupportTranslations,
    {
      [NAME_ONLY_WARNING]:
        'Les tickets attribués uniquement par nom peuvent ne pas apparaître dans cette liste.',
      [NO_CLERKS_AVAILABLE]: "Aucun agent de support n'est disponible.",
    },
  ],
  it: [
    itLang as SupportTranslations,
    {
      [NAME_ONLY_WARNING]: 'I ticket assegnati solo per nome potrebbero non comparire in questo elenco.',
      [NO_CLERKS_AVAILABLE]: 'Nessun operatore di supporto è disponibile.',
    },
  ],
};

describe('support dashboard translations', () => {
  it.each(Object.keys(EXPECTED))('defines the dashboard messages in screens/support for %s', (lang) => {
    const [translations, expected] = EXPECTED[lang];

    for (const [key, value] of Object.entries(expected)) {
      expect(translations['screens/support'][key]).toBe(value);
    }
  });
});
