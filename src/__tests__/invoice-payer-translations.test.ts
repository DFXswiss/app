// Covers only the seven payer-mode keys added for the invoice screen in de/fr/it.
// Full language-file parity across every key is intentionally out of scope for this change.

import de from 'src/translations/languages/de.json';
import fr from 'src/translations/languages/fr.json';
import itLang from 'src/translations/languages/it.json';

const PAYER_ACTION_KEYS = ['Continue to payment'] as const;
const PAYER_PAYMENT_KEYS = [
  'Pay invoice',
  'Invoice number',
  'Invoice amount',
  'Payee',
  'Recipient verified',
  'Enter the invoice number and invoice amount exactly as printed on your invoice.',
] as const;

const languages: Record<
  'de' | 'fr' | 'it',
  { 'general/actions': Record<string, string>; 'screens/payment': Record<string, string> }
> = {
  de: de as { 'general/actions': Record<string, string>; 'screens/payment': Record<string, string> },
  fr: fr as { 'general/actions': Record<string, string>; 'screens/payment': Record<string, string> },
  it: itLang as { 'general/actions': Record<string, string>; 'screens/payment': Record<string, string> },
};

const EXPECTED_ACTIONS: Record<'de' | 'fr' | 'it', Record<(typeof PAYER_ACTION_KEYS)[number], string>> = {
  de: {
    'Continue to payment': 'Weiter zur Zahlung',
  },
  fr: {
    'Continue to payment': 'Continuer vers le paiement',
  },
  it: {
    'Continue to payment': 'Procedi al pagamento',
  },
};

const EXPECTED_PAYMENT: Record<'de' | 'fr' | 'it', Record<(typeof PAYER_PAYMENT_KEYS)[number], string>> = {
  de: {
    'Pay invoice': 'Rechnung bezahlen',
    'Invoice number': 'Rechnungsnummer',
    'Invoice amount': 'Rechnungsbetrag',
    Payee: 'Zahlungsempfänger',
    'Recipient verified': 'Empfänger bestätigt',
    'Enter the invoice number and invoice amount exactly as printed on your invoice.':
      'Gib bitte die Rechnungsnummer und den Rechnungsbetrag genau so ein, wie sie auf Deiner Rechnung stehen.',
  },
  fr: {
    'Pay invoice': 'Payer la facture',
    'Invoice number': 'Numéro de facture',
    'Invoice amount': 'Montant de la facture',
    Payee: 'Bénéficiaire',
    'Recipient verified': 'Bénéficiaire vérifié',
    'Enter the invoice number and invoice amount exactly as printed on your invoice.':
      'Saisissez le numéro et le montant de la facture exactement comme indiqués sur votre facture.',
  },
  it: {
    'Pay invoice': 'Paga la fattura',
    'Invoice number': 'Numero della fattura',
    'Invoice amount': 'Importo della fattura',
    Payee: 'Beneficiario',
    'Recipient verified': 'Beneficiario verificato',
    'Enter the invoice number and invoice amount exactly as printed on your invoice.':
      "Inserisci il numero e l'importo della fattura esattamente come indicati sulla fattura.",
  },
};

describe('invoice payer translations', () => {
  it.each(Object.keys(languages) as Array<'de' | 'fr' | 'it'>)(
    'defines a non-empty, non-English translation for each invoice payer key in %s',
    (lang) => {
      const actions = languages[lang]['general/actions'];
      const payment = languages[lang]['screens/payment'];

      for (const key of PAYER_ACTION_KEYS) {
        const value = actions[key];
        expect(value).toBe(EXPECTED_ACTIONS[lang][key]);
      }

      for (const key of PAYER_PAYMENT_KEYS) {
        // Keys contain periods — always index the object directly, never split on '.'.
        const value = payment[key];
        expect(value).toBe(EXPECTED_PAYMENT[lang][key]);
      }
    },
  );
});
