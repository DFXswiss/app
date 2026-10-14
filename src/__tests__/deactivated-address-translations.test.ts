import de from 'src/translations/languages/de.json';
import fr from 'src/translations/languages/fr.json';
import itLang from 'src/translations/languages/it.json';

interface Translations {
  'general/actions': Record<string, string>;
  'screens/home': Record<string, string>;
  'screens/settings': Record<string, string>;
}

const EXPECTED: Record<
  string,
  {
    translations: Translations;
    action: string;
    notice: string;
    deletion: string;
    oldSentence: string;
  }
> = {
  de: {
    translations: de as Translations,
    action: 'Adresse reaktivieren',
    notice: 'Diese Adresse ist bei DFX deaktiviert.',
    deletion:
      'Bist Du sicher, dass Du die Adresse <1>{{address}}</1> von Deinem DFX-Konto löschen möchtest? Du kannst sie reaktivieren, indem Du Dich erneut mit ihr anmeldest.',
    oldSentence: 'Diese Aktion ist nicht rückgängig zu machen.',
  },
  fr: {
    translations: fr as Translations,
    action: "Réactiver l'adresse",
    notice: 'Cette adresse est désactivée chez DFX.',
    deletion:
      "Êtes-vous sûr de vouloir supprimer l'adresse <1>{{address}}</1> de votre compte DFX ? Vous pouvez la réactiver en vous connectant à nouveau avec cette adresse.",
    oldSentence: 'Cette action est irréversible.',
  },
  it: {
    translations: itLang as Translations,
    action: "Riattiva l'indirizzo",
    notice: 'Questo indirizzo è disattivato presso DFX.',
    deletion:
      "Siete sicuri di voler eliminare l'indirizzo <1>{{address}}</1> dal vostro account DFX? Potete riattivarlo accedendo nuovamente con questo indirizzo.",
    oldSentence: 'Questa azione è irreversibile.',
  },
};

describe('deactivated address translations', () => {
  it.each(Object.keys(EXPECTED))('defines the reactivation strings for %s', (language) => {
    const { translations, action, notice, deletion, oldSentence } = EXPECTED[language];

    expect(translations['general/actions']['Reactivate address']).toBe(action);
    expect(translations['screens/home']['This address is deactivated in DFX.']).toBe(notice);
    expect(translations['screens/settings'].delete).toBe(deletion);
    expect(translations['screens/settings'].delete).not.toContain(oldSentence);
  });
});
