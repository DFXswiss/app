import de from 'src/translations/languages/de.json';
import fr from 'src/translations/languages/fr.json';
import itLang from 'src/translations/languages/it.json';

const NEW_KEY =
  'Deleting your account ends our business relationship. Under Swiss law we are required to retain all data for 10 years and then permanently delete it.';

const OLD_KEY =
  'Your data will remain on our servers temporarily before permanent deletion. If you have any questions, please contact our support team.';

const languages: Record<'de' | 'fr' | 'it', { 'screens/settings': Record<string, string> }> = {
  de: de as { 'screens/settings': Record<string, string> },
  fr: fr as { 'screens/settings': Record<string, string> },
  it: itLang as { 'screens/settings': Record<string, string> },
};

const EXPECTED: Record<'de' | 'fr' | 'it', string> = {
  de:
    'Mit dem Löschen des Kontos beenden wir die Geschäftsbeziehung. Nach schweizerischem Recht sind wir verpflichtet, sämtliche Daten 10 Jahre zu speichern und sie anschliessend endgültig zu löschen.',
  fr:
    "La suppression de votre compte met fin à notre relation commerciale. Conformément au droit suisse, nous sommes tenus de conserver l'ensemble des données pendant 10 ans, puis de les supprimer définitivement.",
  it:
    "Cancellando l'account terminiamo il rapporto commerciale. Secondo il diritto svizzero siamo obbligati a conservare tutti i dati per 10 anni e poi a cancellarli definitivamente.",
};

describe('settings danger zone translations', () => {
  it.each(Object.keys(languages) as Array<'de' | 'fr' | 'it'>)(
    'defines the Swiss 10-year retention notice in %s and drops the old temporary-retention key',
    (lang) => {
      const settings = languages[lang]['screens/settings'];

      expect(settings[NEW_KEY]).toBe(EXPECTED[lang]);
      expect(settings[OLD_KEY]).toBeUndefined();
      expect(JSON.stringify(languages[lang])).not.toContain(OLD_KEY);
    },
  );
});
