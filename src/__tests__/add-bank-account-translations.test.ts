import de from 'src/translations/languages/de.json';
import fr from 'src/translations/languages/fr.json';
import itLang from 'src/translations/languages/it.json';

type Catalog = {
  'general/errors': Record<string, string>;
  'general/actions': Record<string, string>;
};

const languages: Record<'de' | 'fr' | 'it', Catalog> = {
  de: de as Catalog,
  fr: fr as Catalog,
  it: itLang as Catalog,
};

const NO_WALLET: Record<'de' | 'fr' | 'it', string> = {
  de: 'Bevor Du eine Bankverbindung hinterlegen kannst, braucht Dein DFX-Konto eine Wallet. <1></1>',
  fr: "Avant de pouvoir ajouter un compte bancaire, votre compte DFX a besoin d'un portefeuille. <1></1>",
  it: 'Prima di poter aggiungere un conto bancario, il tuo account DFX ha bisogno di un wallet. <1></1>',
};

const CONNECT_WALLET: Record<'de' | 'fr' | 'it', string> = {
  de: 'Wallet verbinden',
  fr: 'Connecter un portefeuille',
  it: 'Collega un wallet',
};

describe('add-bank-account translations', () => {
  it.each(Object.keys(languages) as Array<'de' | 'fr' | 'it'>)(
    'defines the KycOnly bank-account hint and connect-wallet action in %s',
    (lang) => {
      const errors = languages[lang]['general/errors'];
      const actions = languages[lang]['general/actions'];

      expect(errors.no_wallet).toBe(NO_WALLET[lang]);
      expect(errors.no_wallet).toContain('<1></1>');
      expect(actions['Connect a wallet']).toBe(CONNECT_WALLET[lang]);
    },
  );
});
