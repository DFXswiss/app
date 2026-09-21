import de from 'src/translations/languages/de.json';
import fr from 'src/translations/languages/fr.json';
import itLang from 'src/translations/languages/it.json';

type Errors = { 'general/errors': Record<string, string> };

const FIELD = 'Contains unsupported characters. Use simple letters, e.g. l instead of ł.';
const CHARSET =
  'Your name or address contains characters that our bank payments do not support. Please replace them with simple letters (e.g. l instead of ł) and try again.';
const BANK = 'This bank is not supported by DFX. Please use an account at a different bank.';

const EXPECTED: Record<string, [Errors, Record<string, string>]> = {
  de: [
    de as Errors,
    {
      [FIELD]: 'Enthält nicht unterstützte Zeichen. Bitte einfache Buchstaben verwenden, z. B. l statt ł.',
      [CHARSET]:
        'Dein Name oder deine Adresse enthält Zeichen, die unsere Bankzahlungen nicht unterstützen. Bitte ersetze sie durch einfache Buchstaben (z. B. l statt ł) und versuche es erneut.',
      [BANK]: 'Diese Bank wird von DFX nicht unterstützt. Bitte verwende ein Konto bei einer anderen Bank.',
    },
  ],
  fr: [
    fr as Errors,
    {
      [FIELD]: 'Contient des caractères non pris en charge. Utilisez des lettres simples, p. ex. l au lieu de ł.',
      [CHARSET]:
        'Votre nom ou votre adresse contient des caractères que nos paiements bancaires ne prennent pas en charge. Veuillez les remplacer par des lettres simples (p. ex. l au lieu de ł) et réessayer.',
      [BANK]: "Cette banque n'est pas prise en charge par DFX. Veuillez utiliser un compte auprès d'une autre banque.",
    },
  ],
  it: [
    itLang as Errors,
    {
      [FIELD]: 'Contiene caratteri non supportati. Usa lettere semplici, ad es. l invece di ł.',
      [CHARSET]:
        'Il tuo nome o indirizzo contiene caratteri che i nostri pagamenti bancari non supportano. Sostituiscili con lettere semplici (ad es. l invece di ł) e riprova.',
      [BANK]: "Questa banca non è supportata da DFX. Utilizza un conto presso un'altra banca.",
    },
  ],
};

describe('known rejection translations', () => {
  it.each(Object.keys(EXPECTED))('defines the hints in general/errors for %s', (lang) => {
    const [translations, expected] = EXPECTED[lang];

    for (const [key, value] of Object.entries(expected)) {
      expect(translations['general/errors'][key]).toBe(value);
    }
  });
});
