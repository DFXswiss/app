// Covers only the screens/kyc keys of the KYC link prompts in de/fr/it.
// Full language-file parity across every key is intentionally out of scope for this change.

import de from 'src/translations/languages/de.json';
import fr from 'src/translations/languages/fr.json';
import itLang from 'src/translations/languages/it.json';

type Lang = 'de' | 'fr' | 'it';

const languages: Record<Lang, { 'screens/kyc': Record<string, string> }> = {
  de: de as { 'screens/kyc': Record<string, string> },
  fr: fr as { 'screens/kyc': Record<string, string> },
  it: itLang as { 'screens/kyc': Record<string, string> },
};

const EXPECTED: Record<string, Record<Lang, string>> = {
  'This link belongs to a different account than the one you are signed in with. If you open the link, the data you enter is saved to that account.':
    {
      de: 'Dieser Link gehört zu einem anderen Konto als dem, mit dem Sie angemeldet sind. Wenn Sie den Link öffnen, werden Ihre Eingaben in jenem Konto gespeichert.',
      fr: 'Ce lien appartient à un autre compte que celui avec lequel vous êtes connecté. Si vous ouvrez le lien, les données saisies sont enregistrées dans cet autre compte.',
      it: "Questo link appartiene a un account diverso da quello con cui hai effettuato l'accesso. Se apri il link, i dati inseriti vengono salvati in quell'account.",
    },
  'Continue with my account': {
    de: 'Mit meinem Konto fortfahren',
    fr: 'Continuer avec mon compte',
    it: 'Continua con il mio account',
  },
  'Open link': {
    de: 'Link öffnen',
    fr: 'Ouvrir le lien',
    it: 'Apri il link',
  },
  'Do you want to start the step "{{step}}"?': {
    de: 'Möchten Sie den Schritt "{{step}}" starten?',
    fr: 'Voulez-vous démarrer l\'étape "{{step}}" ?',
    it: 'Vuoi avviare il passaggio "{{step}}"?',
  },
};

const cases = Object.entries(EXPECTED).flatMap(([key, values]) =>
  (Object.keys(values) as Lang[]).map((lang) => [lang, key, values[lang]] as const),
);

describe('KYC link prompt translations', () => {
  it.each(cases)('defines the exact %s sentence for "%s" in screens/kyc', (lang, key, expected) => {
    // Keys contain periods — always index the object directly, never split on '.'.
    expect(languages[lang]['screens/kyc'][key]).toBe(expected);
  });
});
