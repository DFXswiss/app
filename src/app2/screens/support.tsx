// DFX App 2.0 — support screen.
//
// Ported from the static preview's `v-support` / `v-ticket` / `v-chat`
// sections (public/app2/index.html, markup ~lines 946-1066; `openTicket()` /
// `submitTicket()` around line 1935, `openChat()` / `chatSend()` around line
// 2032 for behaviour) — the FAQ/knowledge-base search isn't part of this
// milestone's task list, so this screen covers ticket list, create-issue and
// the chat thread only. `SupportChatContextProvider` isn't mounted by
// DfxContextProvider (unlike UserContextProvider), so this screen mounts its
// own instance, scoped to this route.

import {
  ApiException,
  CreateSupportIssue,
  SupportChatContextProvider,
  SupportIssue,
  SupportIssueReason,
  SupportIssueState,
  SupportIssueType,
  SupportMessage,
  SupportMessageStatus,
  useSupportChatContext,
  useUser,
  useUserContext,
} from '@dfx.swiss/react';
import { ChangeEvent, FormEvent, useCallback, useEffect, useId, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { LoadingRow, onActivate, Sheet, SheetHeader, useToast } from '../components/ui';
import { useT, type Language, type TranslationKey } from '../i18n';
import { useWalletSession } from '../wallets/session';
import { formatDateTime, shortAddress } from './parts/format';
import { findSendCandidate, shouldSyncSupportIssue, type SendAttempt } from './support-delivery';

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const SEND_SETTLE_TIMEOUT_MS = 30_000;

interface TicketTypeOption {
  key: TranslationKey;
  type: SupportIssueType;
  reason: SupportIssueReason;
}

// Curated topic list — mirrors the static app's `TICKET_TYPES` (a friendlier
// front door than a raw 8-value SupportIssueType dropdown).
const TICKET_TYPES: TicketTypeOption[] = [
  { key: 'tkGeneral', type: SupportIssueType.GENERIC_ISSUE, reason: SupportIssueReason.OTHER },
  { key: 'tkTrade', type: SupportIssueType.GENERIC_ISSUE, reason: SupportIssueReason.FUNDS_NOT_RECEIVED },
  { key: 'tkTxMissing', type: SupportIssueType.TRANSACTION_ISSUE, reason: SupportIssueReason.TRANSACTION_MISSING },
  { key: 'tkTxFunds', type: SupportIssueType.TRANSACTION_ISSUE, reason: SupportIssueReason.FUNDS_NOT_RECEIVED },
  { key: 'tkKyc', type: SupportIssueType.KYC_ISSUE, reason: SupportIssueReason.OTHER },
  { key: 'tkBug', type: SupportIssueType.BUG_REPORT, reason: SupportIssueReason.OTHER },
];

const ISSUE_TYPE_KEY: Record<SupportIssueType, TranslationKey> = {
  [SupportIssueType.GENERIC_ISSUE]: 'itGeneric',
  [SupportIssueType.TRANSACTION_ISSUE]: 'itTransaction',
  [SupportIssueType.VERIFICATION_CALL]: 'itVerification',
  [SupportIssueType.KYC_ISSUE]: 'itKyc',
  [SupportIssueType.LIMIT_REQUEST]: 'itLimit',
  [SupportIssueType.PARTNERSHIP_REQUEST]: 'itPartner',
  [SupportIssueType.NOTIFICATION_OF_CHANGES]: 'itChanges',
  [SupportIssueType.BUG_REPORT]: 'itBug',
};

function issueTypeLabel(t: (key: TranslationKey) => string, type: SupportIssueType): string {
  return t(ISSUE_TYPE_KEY[type] ?? 'itGeneric');
}

interface KbArticle {
  c: string;
  q: string;
  a: string;
}

// Knowledge-base category filters — mirrors the static app's `KB_CATS`
// (labels resolve via the `kc_<cat>` i18n keys). "all" is the catch-all default.
const KB_CATS = ['all', 'ocp', 'pay', 'trade', 'account', 'wallet'] as const;
type KbCat = (typeof KB_CATS)[number];

// Knowledge-base articles — bundled equivalent of the static app's
// `assets/i18n/kb.json` (fetched there, inlined here). Answers are trusted,
// author-controlled HTML rendered via dangerouslySetInnerHTML below.
const KB_DATA: Record<Language, KbArticle[]> = {
  en: [
    {
      c: 'ocp',
      q: 'Accept crypto payments in your business (OpenCryptoPay)',
      a: 'OpenCryptoPay turns any invoice or till into a single QR code your customers scan to pay you in crypto — Bitcoin, Lightning, Ethereum, Polygon and more — while you get settled in your own currency (CHF or EUR). There is no integration and no coding.<br><br><b>How to start:</b> 1) Apply for OpenCryptoPay (menu &#8594; OpenCryptoPay &#8594; Apply). 2) Once approved, add a Lightning payout route. 3) Create a payment link for your till, or an invoice for a specific amount, then download or print the QR.<br><br><b>How your customer pays:</b> they scan the QR with their phone, pick a blockchain, and pay from their wallet. The QR is generated on your side and holds no customer data — DFX only learns of the payment when it is scanned. You can run a point-of-sale terminal, print QR stickers, and track every payment in your history.',
    },
    {
      c: 'trade',
      q: 'How do I buy crypto? (step by step)',
      a: "1) Connect your wallet (or sign in with email). 2) Choose the coin you want and the amount. 3) DFX shows the payment details: a recipient, an IBAN and a <b>reference</b> (a code like xxxx-xxxx-xxxx). 4) Make a normal bank transfer for that amount and paste the reference into the payment-reference field. 5) Within a few minutes to one business day the crypto arrives directly in your own wallet.<br><br>You don't need an exchange account, and DFX never holds your coins.",
    },
    {
      c: 'trade',
      q: 'How do I sell crypto? (and the most common mistake)',
      a: 'On the Sell screen: 1) Pick the coin to sell and enter an amount. 2) Enter the bank account (IBAN) where you want your money. 3) DFX shows a <b>deposit address</b> — copy it with the copy icon.<br><br><b>Important:</b> first send your coins from your wallet to that address. Only sending starts the sale. Many people press the big confirm button too early, before sending the coins — then nothing happens. Send a small test amount first, wait for the confirmation email, then send the rest.',
    },
    {
      c: 'trade',
      q: 'Reuse your reference: templates and a savings plan',
      a: "Your reference (the xxxx-xxxx-xxxx code) is permanent — you can use it again and again, with any amount.<br><br>Tip: save a transfer template at your bank with DFX's details and your reference, so future buys take seconds. You can also set up a standing order (weekly or monthly) to buy automatically — a simple crypto savings plan.",
    },
    {
      c: 'pay',
      q: "What is the 'reference' (purpose of payment) and where do I find it?",
      a: "The reference is your personal code in the format <b>xxxx-xxxx-xxxx</b>. It tells DFX which coins to deliver, to which wallet, and on which account. Without it we cannot match your transfer.<br><br>You see it on the Buy screen together with the recipient and IBAN. Always use the copy icon next to it to avoid typing mistakes, and paste it into your bank's 'reference' / 'purpose of payment' field.",
    },
    {
      c: 'pay',
      q: 'I transferred money without the reference',
      a: "Don't worry, it can be fixed. Fastest way: sign in to your DFX account (by email or wallet) and add your <b>IBAN</b> under Settings → your bank accounts. Once DFX knows your IBAN, your transfer is matched automatically and shows up as account balance, which you can then assign to your coin.<br><br>Alternatively, send a second small transfer that does include your reference.",
    },
    {
      c: 'pay',
      q: "My deposit wasn't recognised (third-party or joint account)",
      a: "For regulatory reasons a bank account may belong to <b>only one</b> DFX account, and you may only pay from an account in <b>your own name</b>.<br><br>- Payments from a third person or a company account are blocked.<br>- A joint account can work only if both names are shown on the statement, the IBAN isn't already used on another DFX account, and our team has checked it.<br><br>If your payment was held, our finance team reviews the bank details and unlocks them for future deposits. Use an account in your own name to avoid delays.",
    },
    {
      c: 'pay',
      q: 'DFX bank details and minimum amounts',
      a: 'Recipient: <b>DFX AG</b>.<br>EUR: IBAN CH8583019... (DFX SWISS EUR).<br>CHF: IBAN CH4883019... (DFX SWISS CHF).<br>Always include your reference (xxxx-xxxx-xxxx).<br><br>The exact IBAN is always shown on your Buy screen — use that one. If you saved an old template or standing order, update it to the new IBAN.<br><br>Minimum amounts: Bitcoin 15 EUR, Lightning 5 EUR, Monero 5 EUR, other coins 15 EUR. You can also generate a personal IBAN in your own name on the Buy screen.',
    },
    {
      c: 'pay',
      q: "Revolut shows 'Sent from Revolut' instead of my reference",
      a: "Revolut fills the reference field with 'Sent from Revolut' by default. Before sending, replace that text with <b>your</b> reference (xxxx-xxxx-xxxx) in the reference/message field. Otherwise the first payment can't be matched until DFX knows your IBAN.",
    },
    {
      c: 'account',
      q: 'How much can I buy without verification (limits)?',
      a: 'Without identity verification (KYC): up to <b>1000 CHF per 30 days</b> (a rule introduced in Feb 2025) and up to 50,000 CHF per year. With KYC: up to 100,000 CHF per year. The yearly limit counts over the last 12 months, not the calendar year.<br><br>Need more than 100,000 CHF/year? You can request a higher limit and provide a proof of the origin of your funds (menu → Increase limit, or KYC → trading limit).',
    },
    {
      c: 'account',
      q: 'Why am I asked to verify my identity (KYC)?',
      a: "KYC means a one-time identity check. It is not about the amount — it's about you as a person. Sometimes a name-screening tool flags a possible match (a 'fuzzy' hit) even when it isn't really you; to be safe, DFX then asks for KYC.<br><br>Complete it on <a href='https://app.dfx.swiss/kyc' target='_blank' rel='noopener'>app.dfx.swiss</a> under the KYC menu. Once verified, your limits go up and future deposits run smoothly.",
    },
    {
      c: 'account',
      q: 'New accounts need a referral',
      a: "To open a DFX account you now need a recommendation from an existing customer. At the KYC step 'Recommendation' you'll be asked for their referral code.<br><br>Choose someone you personally know and trust — they vouch that you're a real customer, which protects new users from scams. If they don't know where to find their code, they can sign in and open a support request from their verified account.",
    },
    {
      c: 'account',
      q: 'I have two DFX accounts / my IBAN is used in another account',
      a: 'An IBAN may be linked to only one DFX account. If your bank account is registered on another of your accounts, the two accounts must be merged.<br><br>Decide which email you want to keep, then use the email link DFX sends (in the KYC step) to confirm the merge. After merging, your IBAN works again. If one side is a verified account, mention both accounts in your request so our tech team can merge them.',
    },
    {
      c: 'account',
      q: "I'm a US citizen / US tax resident",
      a: 'For regulatory reasons (FATCA / IRS) DFX cannot verify US citizens or persons with a US tax obligation — even with a European passport. This applies from the moment someone is registered and taxable in the US (green card, citizenship, etc.). DFX also does not accept USD deposits.',
    },
    {
      c: 'wallet',
      q: "My coins don't show up in my wallet (e.g. Cake Wallet / Monero)",
      a: "Your wallet may still be syncing. Open the balance screen and check the status bar:<br>- <b>Synchronised</b> — all good.<br>- <b>Connecting</b> — wait a moment.<br>- <b>Blocks remaining</b> — keep the app open on the balance screen until it reaches 0.<br><br>If it still doesn't appear, run a rescan of the blockchain starting 1-2 days before your purchase. If that doesn't help, contact your wallet's support.",
    },
    {
      c: 'wallet',
      q: 'A new address / sub-address appeared (new reference)',
      a: "Some wallets (Cake Wallet is known for this) automatically create a new sub-address, which produces a new reference. You can turn this off in the wallet's Privacy settings ('Subaddresses') and update the app.<br><br>Existing addresses and references can simply be reused, so you don't have to start over each time.",
    },
    {
      c: 'wallet',
      q: 'How do I link a new wallet or address to my account?',
      a: "If you start using a new wallet address that isn't verified yet, you can link it to your existing verified account so it keeps the same KYC level.<br><br>On the Buy screen, when a new address shows a KYC request instead of a reference, use the button <b>'I am already verified at DFX'</b>, or open the KYC step and enter the email of your main account. DFX emails you a link — click it to confirm the link.",
    },
    {
      c: 'wallet',
      q: 'Change your email or phone, or lost access to your email',
      a: 'Change your email or phone yourself under menu → Settings → personal data. To change the email you must be able to receive mail at the new address.<br><br>Lost access to the email on your account? Send a small bank transfer (about 0.50-1 EUR) from your own account, and write your <b>correct email</b> in the reference field. This proves the request is really from you; our team then restores email access.',
    },
    {
      c: 'wallet',
      q: 'Find your transaction history and your referral code',
      a: "Sign in by email or wallet at <a href='https://app.dfx.swiss/login' target='_blank' rel='noopener'>app.dfx.swiss</a>.<br>- History: menu → Transactions. You can also export a CSV report.<br>- Referral code: menu → Account, scroll down. A referral code needs a verified, active account (KYC level 50) and some of your own trading volume. Share your referral link only with people you know.",
    },
    {
      c: 'account',
      q: 'Delete or reactivate your account; remove an address',
      a: 'You can delete your account under menu → Settings → Delete account. It gets a deletion mark; by law your data is kept for 10 years. You can reactivate later by signing in with your email, or by making a buy or sell.<br><br>Removing a wallet address (Settings → your addresses → the three dots → Delete) is <b>permanent</b> — a removed address cannot be added back, so use it with care.',
    },
  ],
  de: [
    {
      c: 'ocp',
      q: 'Krypto-Zahlungen im Geschäft annehmen (OpenCryptoPay)',
      a: 'OpenCryptoPay macht aus jeder Rechnung oder Kasse einen einzigen QR-Code, den deine Kunden scannen, um dich in Krypto zu bezahlen — Bitcoin, Lightning, Ethereum, Polygon und mehr — während du in deiner eigenen Währung (CHF oder EUR) ausbezahlt wirst. Keine Integration, kein Programmieren.<br><br><b>So startest du:</b> 1) Bewirb dich für OpenCryptoPay (Menü &#8594; OpenCryptoPay &#8594; Bewerben). 2) Nach der Freigabe füge eine Lightning-Auszahlungsroute hinzu. 3) Erstelle einen Zahlungslink für deine Kasse oder eine Rechnung über einen festen Betrag und lade den QR-Code herunter oder drucke ihn.<br><br><b>So zahlt dein Kunde:</b> Er scannt den QR-Code mit dem Handy, wählt eine Blockchain und zahlt aus seiner Wallet. Der QR-Code wird auf deiner Seite erzeugt und enthält keine Kundendaten — DFX erfährt erst beim Scannen von der Zahlung. Du kannst eine Kasse betreiben, QR-Sticker drucken und jede Zahlung in deinem Verlauf nachverfolgen.',
    },
    {
      c: 'trade',
      q: 'Wie kaufe ich Krypto? (Schritt für Schritt)',
      a: '1) Verbinde deine Wallet (oder melde dich per E-Mail an). 2) Wähle die gewünschte Münze und den Betrag. 3) DFX zeigt dir die Zahlungsdaten: Empfänger, IBAN und einen <b>Verwendungszweck</b> (ein Code wie xxxx-xxxx-xxxx). 4) Mache eine ganz normale Banküberweisung über diesen Betrag und trage den Verwendungszweck im Feld ‚Verwendungszweck‘ ein. 5) Innerhalb von wenigen Minuten bis zu einem Werktag landet die Krypto direkt in deiner eigenen Wallet.<br><br>Du brauchst kein Börsenkonto, und DFX verwahrt deine Coins nie.',
    },
    {
      c: 'trade',
      q: 'Wie verkaufe ich Krypto? (und der häufigste Fehler)',
      a: 'Auf dem Verkaufen-Screen: 1) Wähle die Münze zum Verkaufen und gib einen Betrag ein. 2) Gib das Bankkonto (IBAN) an, auf das dein Geld soll. 3) DFX zeigt dir eine <b>Auszahlungs-Adresse</b> — kopiere sie mit dem Kopier-Icon.<br><br><b>Wichtig:</b> Sende deine Coins zuerst aus deiner Wallet an diese Adresse. Erst das Senden löst den Verkauf aus. Viele drücken zu früh den grossen Bestätigen-Button, bevor sie die Coins gesendet haben — dann passiert nichts. Sende zuerst einen kleinen Testbetrag, warte die Bestätigungs-E-Mail ab, dann den Rest.',
    },
    {
      c: 'trade',
      q: 'Verwendungszweck wiederverwenden: Vorlagen und Sparplan',
      a: 'Dein Verwendungszweck (der Code xxxx-xxxx-xxxx) ist dauerhaft gültig — du kannst ihn immer wieder verwenden, mit beliebigen Beträgen.<br><br>Tipp: Lege bei deiner Bank eine Überweisungsvorlage mit den DFX-Daten und deinem Verwendungszweck an, dann dauern künftige Käufe nur Sekunden. Mit einem Dauerauftrag (wöchentlich oder monatlich) kaufst du automatisch — ein einfacher Krypto-Sparplan.',
    },
    {
      c: 'pay',
      q: 'Was ist der Verwendungszweck und wo finde ich ihn?',
      a: 'Der Verwendungszweck ist dein persönlicher Code im Format <b>xxxx-xxxx-xxxx</b>. Er sagt DFX, welche Coins geliefert werden, an welche Wallet und auf welchem Konto. Ohne ihn können wir deine Überweisung nicht zuordnen.<br><br>Du siehst ihn auf dem Kaufen-Screen zusammen mit Empfänger und IBAN. Nutze immer das Kopier-Icon daneben, um Tippfehler zu vermeiden, und füge ihn im Feld ‚Verwendungszweck‘ deiner Bank ein.',
    },
    {
      c: 'pay',
      q: 'Ich habe ohne Verwendungszweck überwiesen',
      a: 'Kein Problem, das lässt sich lösen. Am schnellsten: Melde dich in deinem DFX-Konto an (per E-Mail oder Wallet) und hinterlege deine <b>IBAN</b> unter Einstellungen → deine Bankkonten. Sobald DFX deine IBAN kennt, wird deine Überweisung automatisch zugeordnet und als Guthaben angezeigt, das du dann deinem Coin zuweisen kannst.<br><br>Alternativ sendest du eine zweite kleine Überweisung, die deinen Verwendungszweck enthält.',
    },
    {
      c: 'pay',
      q: 'Meine Einzahlung wurde nicht erkannt (Dritt- oder Gemeinschaftskonto)',
      a: 'Aus regulatorischen Gründen darf ein Bankkonto nur <b>einem</b> DFX-Konto zugeordnet sein, und du darfst nur von einem Konto auf <b>deinen eigenen Namen</b> einzahlen.<br><br>- Zahlungen von einer dritten Person oder einem Firmenkonto werden blockiert.<br>- Ein Gemeinschaftskonto geht nur, wenn beide Namen auf dem Auszug stehen, die IBAN nicht schon für ein anderes DFX-Konto genutzt wird und unser Team es geprüft hat.<br><br>Wurde deine Zahlung gehalten, prüft unsere Fachabteilung die Bankverbindung und schaltet sie für künftige Einzahlungen frei. Nutze ein Konto auf deinen Namen, um Verzögerungen zu vermeiden.',
    },
    {
      c: 'pay',
      q: 'DFX-Bankverbindung und Mindestbeträge',
      a: 'Empfänger: <b>DFX AG</b>.<br>EUR: IBAN CH8583019... (DFX SWISS EUR).<br>CHF: IBAN CH4883019... (DFX SWISS CHF).<br>Gib immer deinen Verwendungszweck an (xxxx-xxxx-xxxx).<br><br>Die genaue IBAN steht immer auf deinem Kaufen-Screen — nutze diese. Hast du eine alte Vorlage oder einen Dauerauftrag gespeichert, aktualisiere sie auf die neue IBAN.<br><br>Mindestbeträge: Bitcoin 15 EUR, Lightning 5 EUR, Monero 5 EUR, andere Coins 15 EUR. Auf dem Kaufen-Screen kannst du dir auch eine persönliche IBAN auf deinen Namen erstellen.',
    },
    {
      c: 'pay',
      q: 'Revolut zeigt ‚Sent from Revolut‘ statt meinem Verwendungszweck',
      a: 'Revolut füllt das Verwendungszweck-Feld standardmässig mit ‚Sent from Revolut‘. Ersetze diesen Text vor dem Senden durch <b>deinen</b> Verwendungszweck (xxxx-xxxx-xxxx). Sonst kann die erste Zahlung erst zugeordnet werden, wenn DFX deine IBAN kennt.',
    },
    {
      c: 'account',
      q: 'Wie viel kann ich ohne Verifizierung kaufen (Limits)?',
      a: "Ohne Identitätsprüfung (KYC): bis <b>1000 CHF pro 30 Tage</b> (Regel seit Februar 2025) und bis 50'000 CHF pro Jahr. Mit KYC: bis 100'000 CHF pro Jahr. Das Jahreslimit zählt über die letzten 12 Monate, nicht das Kalenderjahr.<br><br>Mehr als 100'000 CHF/Jahr nötig? Du kannst ein höheres Limit beantragen und einen Nachweis über die Herkunft der Gelder einreichen (Menü → Limit erhöhen, oder KYC → Tradinglimit).",
    },
    {
      c: 'account',
      q: 'Warum werde ich zur Verifizierung (KYC) aufgefordert?',
      a: "KYC ist eine einmalige Identitätsprüfung. Es geht nicht um den Betrag, sondern um dich als Person. Manchmal schlägt eine Namensprüfung einen möglichen Treffer vor (ein ‚Fuzzy‘-Treffer), auch wenn du es gar nicht bist; zur Sicherheit fragt DFX dann KYC an.<br><br>Erledige es auf <a href='https://app.dfx.swiss/kyc' target='_blank' rel='noopener'>app.dfx.swiss</a> unter dem Menüpunkt KYC. Nach der Verifizierung steigen deine Limits und künftige Einzahlungen laufen reibungslos.",
    },
    {
      c: 'account',
      q: 'Neue Konten brauchen eine Empfehlung',
      a: 'Um ein DFX-Konto zu eröffnen, brauchst du jetzt die Empfehlung eines bestehenden Kunden. Beim KYC-Schritt ‚Empfehlung‘ wirst du nach dessen Ref-Code gefragt.<br><br>Wähle jemanden, den du persönlich kennst und dem du vertraust — er bestätigt, dass du ein echter Kunde bist, was neue Nutzer vor Betrug schützt. Weiss er nicht, wo er seinen Code findet, kann er sich einloggen und aus seinem verifizierten Konto eine Support-Anfrage stellen.',
    },
    {
      c: 'account',
      q: 'Ich habe zwei DFX-Konten / meine IBAN ist in einem anderen Konto',
      a: 'Eine IBAN darf nur mit einem DFX-Konto verbunden sein. Ist dein Bankkonto in einem anderen deiner Konten registriert, müssen die beiden Konten zusammengeführt werden.<br><br>Entscheide dich für eine E-Mail-Adresse und bestätige die Zusammenführung über den Link, den DFX dir (im KYC-Schritt) per E-Mail sendet. Danach funktioniert deine IBAN wieder. Ist eine Seite ein verifiziertes Konto, nenne in deiner Anfrage beide Konten, damit unser Tech-Team sie zusammenführen kann.',
    },
    {
      c: 'account',
      q: 'Ich bin US-Bürger / in den USA steuerpflichtig',
      a: 'Aus regulatorischen Gründen (FATCA / IRS) kann DFX US-Bürger oder in den USA steuerpflichtige Personen nicht verifizieren — auch nicht mit europäischem Pass. Das gilt, sobald jemand in den USA registriert und steuerpflichtig ist (Greencard, Staatsbürgerschaft usw.). DFX akzeptiert ausserdem keine USD-Einzahlungen.',
    },
    {
      c: 'wallet',
      q: 'Meine Coins erscheinen nicht in der Wallet (z. B. Cake Wallet / Monero)',
      a: 'Deine Wallet synchronisiert vielleicht noch. Öffne den Guthaben-Bildschirm und prüfe die Statusleiste:<br>- <b>Synchronisiert</b> — alles gut.<br>- <b>Verbindung wird hergestellt</b> — kurz warten.<br>- <b>Blöcke verbleibend</b> — lass die App auf dem Guthaben-Bildschirm offen, bis 0 erreicht ist.<br><br>Erscheint sie immer noch nicht, starte einen Neuscan der Blockchain ab 1-2 Tagen vor deinem Kauf. Hilft das nicht, kontaktiere den Support deiner Wallet.',
    },
    {
      c: 'wallet',
      q: 'Eine neue Adresse / Sub-Adresse ist aufgetaucht (neuer Verwendungszweck)',
      a: 'Manche Wallets (Cake Wallet ist dafür bekannt) erstellen automatisch eine neue Sub-Adresse, wodurch ein neuer Verwendungszweck entsteht. Du kannst das in den Privacy-Einstellungen der Wallet abschalten (‚Subaddresses‘) und die App aktualisieren.<br><br>Bestehende Adressen und Verwendungszwecke kannst du einfach wiederverwenden, du musst also nicht jedes Mal neu anfangen.',
    },
    {
      c: 'wallet',
      q: 'Wie verknüpfe ich eine neue Wallet oder Adresse mit meinem Konto?',
      a: 'Nutzt du eine neue Wallet-Adresse, die noch nicht verifiziert ist, kannst du sie mit deinem bestehenden, verifizierten Konto verknüpfen, damit sie denselben KYC-Level erhält.<br><br>Wenn auf dem Kaufen-Screen bei einer neuen Adresse statt eines Verwendungszwecks eine KYC-Anforderung erscheint, nutze den Button <b>‚Ich bin bei DFX bereits verifiziert‘</b>, oder öffne den KYC-Schritt und gib die E-Mail deines Hauptkontos ein. DFX schickt dir einen Link — bestätige damit die Verknüpfung.',
    },
    {
      c: 'wallet',
      q: 'E-Mail oder Telefon ändern, oder kein E-Mail-Zugriff mehr',
      a: 'E-Mail oder Telefon änderst du selbst unter Menü → Einstellungen → persönliche Daten. Zum Ändern der E-Mail musst du an der neuen Adresse Mails empfangen können.<br><br>Kein Zugriff mehr auf die E-Mail in deinem Konto? Sende eine kleine Banküberweisung (ca. 0,50-1 EUR) von deinem eigenen Konto und schreibe deine <b>korrekte E-Mail</b> in den Verwendungszweck. Das beweist, dass die Anfrage wirklich von dir stammt; unser Team stellt den E-Mail-Zugriff dann wieder her.',
    },
    {
      c: 'wallet',
      q: 'Transaktionshistorie und Ref-Code finden',
      a: "Melde dich per E-Mail oder Wallet auf <a href='https://app.dfx.swiss/login' target='_blank' rel='noopener'>app.dfx.swiss</a> an.<br>- Historie: Menü → Transaktionen. Du kannst auch einen CSV-Report exportieren.<br>- Ref-Code: Menü → Konto, nach unten scrollen. Ein Ref-Code setzt ein verifiziertes, aktives Konto (KYC-Level 50) und eigenes Handelsvolumen voraus. Teile deinen Ref-Link nur mit Personen, die du kennst.",
    },
    {
      c: 'account',
      q: 'Konto löschen oder reaktivieren; Adresse entfernen',
      a: 'Du kannst dein Konto unter Menü → Einstellungen → Konto löschen entfernen. Es erhält einen Löschvermerk; gesetzlich werden deine Daten 10 Jahre aufbewahrt. Reaktivieren kannst du später per E-Mail-Login oder mit einem Kauf bzw. Verkauf.<br><br>Eine Wallet-Adresse zu entfernen (Einstellungen → deine Adressen → die drei Punkte → Löschen) ist <b>endgültig</b> — eine entfernte Adresse kann nicht wieder hinzugefügt werden, also mit Bedacht nutzen.',
    },
  ],
  it: [
    {
      c: 'ocp',
      q: 'Accetta pagamenti in cripto nella tua attività (OpenCryptoPay)',
      a: "OpenCryptoPay trasforma qualsiasi fattura o cassa in un unico codice QR che i tuoi clienti scansionano per pagarti in cripto — Bitcoin, Lightning, Ethereum, Polygon e altro — mentre tu vieni accreditato nella tua valuta (CHF o EUR). Nessuna integrazione e nessun codice.<br><br><b>Come iniziare:</b> 1) Richiedi OpenCryptoPay (menu &#8594; OpenCryptoPay &#8594; Richiedi). 2) Dopo l'approvazione, aggiungi una rotta di accredito Lightning. 3) Crea un link di pagamento per la cassa o una fattura per un importo preciso, poi scarica o stampa il QR.<br><br><b>Come paga il cliente:</b> scansiona il QR con il telefono, sceglie una blockchain e paga dal suo wallet. Il QR è generato dalla tua parte e non contiene dati del cliente — DFX viene a conoscenza del pagamento solo alla scansione. Puoi gestire una cassa, stampare adesivi QR e tracciare ogni pagamento nello storico.",
    },
    {
      c: 'trade',
      q: 'Come compro cripto? (passo per passo)',
      a: "1) Connetti il tuo wallet (o accedi via email). 2) Scegli la moneta che vuoi e l'importo. 3) DFX mostra i dati di pagamento: un beneficiario, un IBAN e una <b>causale</b> (un codice come xxxx-xxxx-xxxx). 4) Fai un normale bonifico bancario per quell'importo e inserisci la causale nel campo apposito. 5) In pochi minuti, fino a un giorno lavorativo, la cripto arriva direttamente nel tuo wallet.<br><br>Non serve un conto di exchange e DFX non custodisce mai le tue monete.",
    },
    {
      c: 'trade',
      q: "Come vendo cripto? (e l'errore più comune)",
      a: "Nella schermata Vendi: 1) Scegli la moneta da vendere e inserisci un importo. 2) Indica il conto bancario (IBAN) dove vuoi ricevere il denaro. 3) DFX mostra un <b>indirizzo di deposito</b> — copialo con l'icona di copia.<br><br><b>Importante:</b> prima invia le tue monete dal tuo wallet a quell'indirizzo. Solo l'invio avvia la vendita. Molti premono troppo presto il grande pulsante di conferma, prima di aver inviato le monete — e così non succede nulla. Invia prima un piccolo importo di prova, attendi l'email di conferma, poi invia il resto.",
    },
    {
      c: 'trade',
      q: 'Riusa la tua causale: modelli e piano di risparmio',
      a: 'La tua causale (il codice xxxx-xxxx-xxxx) è permanente — puoi riutilizzarla sempre, con qualsiasi importo.<br><br>Consiglio: salva un modello di bonifico in banca con i dati di DFX e la tua causale, così i prossimi acquisti durano pochi secondi. Con un bonifico ricorrente (settimanale o mensile) compri automaticamente — un semplice piano di accumulo cripto.',
    },
    {
      c: 'pay',
      q: "Cos'è la 'causale' e dove la trovo?",
      a: "La causale è il tuo codice personale nel formato <b>xxxx-xxxx-xxxx</b>. Indica a DFX quali monete consegnare, a quale wallet e su quale conto. Senza, non possiamo abbinare il tuo bonifico.<br><br>La vedi nella schermata Compra insieme a beneficiario e IBAN. Usa sempre l'icona di copia accanto per evitare errori di battitura e incollala nel campo 'causale' della tua banca.",
    },
    {
      c: 'pay',
      q: 'Ho fatto un bonifico senza causale',
      a: 'Nessun problema, si può risolvere. Il modo più rapido: accedi al tuo account DFX (via email o wallet) e aggiungi il tuo <b>IBAN</b> in Impostazioni → i tuoi conti bancari. Una volta che DFX conosce il tuo IBAN, il bonifico viene abbinato automaticamente e appare come saldo, che puoi poi assegnare alla tua moneta.<br><br>In alternativa, invia un secondo piccolo bonifico che includa la causale.',
    },
    {
      c: 'pay',
      q: 'Il mio deposito non è stato riconosciuto (conto di terzi o cointestato)',
      a: "Per motivi regolatori un conto bancario può appartenere a <b>un solo</b> account DFX, e puoi pagare solo da un conto a <b>tuo nome</b>.<br><br>- I pagamenti da una terza persona o da un conto aziendale vengono bloccati.<br>- Un conto cointestato funziona solo se entrambi i nomi compaiono sull'estratto, l'IBAN non è già usato su un altro account DFX e il nostro team lo ha verificato.<br><br>Se il pagamento è stato trattenuto, il nostro reparto finanziario verifica i dati bancari e li sblocca per i depositi futuri. Usa un conto a tuo nome per evitare ritardi.",
    },
    {
      c: 'pay',
      q: 'Dati bancari DFX e importi minimi',
      a: "Beneficiario: <b>DFX AG</b>.<br>EUR: IBAN CH8583019... (DFX SWISS EUR).<br>CHF: IBAN CH4883019... (DFX SWISS CHF).<br>Indica sempre la tua causale (xxxx-xxxx-xxxx).<br><br>L'IBAN esatto è sempre mostrato nella schermata Compra — usa quello. Se hai salvato un vecchio modello o un bonifico ricorrente, aggiornalo al nuovo IBAN.<br><br>Importi minimi: Bitcoin 15 EUR, Lightning 5 EUR, Monero 5 EUR, altre monete 15 EUR. Nella schermata Compra puoi anche generare un IBAN personale a tuo nome.",
    },
    {
      c: 'pay',
      q: "Revolut mostra 'Sent from Revolut' invece della mia causale",
      a: "Revolut compila il campo causale con 'Sent from Revolut' in modo predefinito. Prima di inviare, sostituisci quel testo con la <b>tua</b> causale (xxxx-xxxx-xxxx). Altrimenti il primo pagamento non può essere abbinato finché DFX non conosce il tuo IBAN.",
    },
    {
      c: 'account',
      q: 'Quanto posso comprare senza verifica (limiti)?',
      a: "Senza verifica dell'identità (KYC): fino a <b>1000 CHF ogni 30 giorni</b> (regola introdotta a febbraio 2025) e fino a 50'000 CHF all'anno. Con KYC: fino a 100'000 CHF all'anno. Il limite annuale conta sugli ultimi 12 mesi, non sull'anno solare.<br><br>Ti servono più di 100'000 CHF/anno? Puoi richiedere un limite più alto e fornire una prova dell'origine dei fondi (menu → Aumenta il limite, o KYC → limite di trading).",
    },
    {
      c: 'account',
      q: 'Perché mi viene chiesta la verifica (KYC)?',
      a: "Il KYC è un controllo d'identità una tantum. Non riguarda l'importo, ma te come persona. A volte uno strumento di screening dei nomi segnala una possibile corrispondenza (un risultato 'fuzzy') anche se non sei tu; per sicurezza DFX chiede allora il KYC.<br><br>Completalo su <a href='https://app.dfx.swiss/kyc' target='_blank' rel='noopener'>app.dfx.swiss</a> nel menu KYC. Una volta verificato, i tuoi limiti aumentano e i depositi futuri procedono senza problemi.",
    },
    {
      c: 'account',
      q: 'I nuovi account richiedono una raccomandazione',
      a: "Per aprire un account DFX ora serve la raccomandazione di un cliente esistente. Al passaggio KYC 'Raccomandazione' ti verrà chiesto il suo codice referral.<br><br>Scegli qualcuno che conosci personalmente e di cui ti fidi — garantisce che sei un cliente reale, il che protegge i nuovi utenti dalle truffe. Se non sa dove trovare il codice, può accedere e aprire una richiesta di supporto dal suo account verificato.",
    },
    {
      c: 'account',
      q: 'Ho due account DFX / il mio IBAN è usato in un altro account',
      a: "Un IBAN può essere collegato a un solo account DFX. Se il tuo conto bancario è registrato su un altro dei tuoi account, i due account devono essere uniti.<br><br>Decidi quale email tenere, poi usa il link che DFX ti invia via email (nel passaggio KYC) per confermare l'unione. Dopo l'unione il tuo IBAN funziona di nuovo. Se una parte è un account verificato, indica entrambi gli account nella richiesta così il nostro team tecnico può unirli.",
    },
    {
      c: 'account',
      q: 'Sono cittadino USA / residente fiscale USA',
      a: 'Per motivi regolatori (FATCA / IRS) DFX non può verificare cittadini statunitensi o persone con obblighi fiscali negli USA — nemmeno con passaporto europeo. Vale dal momento in cui qualcuno è registrato e tassabile negli USA (green card, cittadinanza, ecc.). DFX inoltre non accetta depositi in USD.',
    },
    {
      c: 'wallet',
      q: 'Le mie monete non compaiono nel wallet (es. Cake Wallet / Monero)',
      a: "Il tuo wallet potrebbe essere ancora in sincronizzazione. Apri la schermata del saldo e controlla la barra di stato:<br>- <b>Sincronizzato</b> — tutto ok.<br>- <b>Connessione</b> — attendi un attimo.<br>- <b>Blocchi rimanenti</b> — tieni l'app aperta sulla schermata del saldo finché non raggiunge 0.<br><br>Se ancora non appare, avvia una nuova scansione della blockchain a partire da 1-2 giorni prima dell'acquisto. Se non aiuta, contatta il supporto del tuo wallet.",
    },
    {
      c: 'wallet',
      q: 'È comparso un nuovo indirizzo / sotto-indirizzo (nuova causale)',
      a: "Alcuni wallet (Cake Wallet è noto per questo) creano automaticamente un nuovo sotto-indirizzo, generando una nuova causale. Puoi disattivarlo nelle impostazioni Privacy del wallet ('Subaddresses') e aggiornare l'app.<br><br>Indirizzi e causali esistenti possono semplicemente essere riutilizzati, quindi non devi ricominciare ogni volta.",
    },
    {
      c: 'wallet',
      q: 'Come collego un nuovo wallet o indirizzo al mio account?',
      a: "Se inizi a usare un nuovo indirizzo wallet non ancora verificato, puoi collegarlo al tuo account verificato esistente così mantiene lo stesso livello KYC.<br><br>Nella schermata Compra, quando un nuovo indirizzo mostra una richiesta KYC invece della causale, usa il pulsante <b>'Sono già verificato su DFX'</b>, oppure apri il passaggio KYC e inserisci l'email del tuo account principale. DFX ti invia un link via email — cliccalo per confermare il collegamento.",
    },
    {
      c: 'wallet',
      q: 'Cambiare email o telefono, o accesso email perso',
      a: "Email o telefono li cambi da solo in menu → Impostazioni → dati personali. Per cambiare l'email devi poter ricevere posta al nuovo indirizzo.<br><br>Hai perso l'accesso all'email del tuo account? Invia un piccolo bonifico (circa 0,50-1 EUR) dal tuo conto e scrivi la tua <b>email corretta</b> nel campo causale. Questo prova che la richiesta è davvero tua; il nostro team ripristina poi l'accesso email.",
    },
    {
      c: 'wallet',
      q: 'Trova lo storico transazioni e il tuo codice referral',
      a: "Accedi via email o wallet su <a href='https://app.dfx.swiss/login' target='_blank' rel='noopener'>app.dfx.swiss</a>.<br>- Storico: menu → Transazioni. Puoi anche esportare un report CSV.<br>- Codice referral: menu → Account, scorri in basso. Il codice referral richiede un account verificato e attivo (livello KYC 50) e un po' del tuo volume di trading. Condividi il link referral solo con persone che conosci.",
    },
    {
      c: 'account',
      q: "Eliminare o riattivare l'account; rimuovere un indirizzo",
      a: "Puoi eliminare l'account in menu → Impostazioni → Elimina account. Riceve un contrassegno di eliminazione; per legge i tuoi dati sono conservati per 10 anni. Puoi riattivarlo in seguito accedendo via email, oppure con un acquisto o una vendita.<br><br>Rimuovere un indirizzo wallet (Impostazioni → i tuoi indirizzi → i tre punti → Elimina) è <b>definitivo</b> — un indirizzo rimosso non può essere riaggiunto, quindi usalo con cautela.",
    },
  ],
  fr: [
    {
      c: 'ocp',
      q: 'Accepte les paiements crypto dans ton commerce (OpenCryptoPay)',
      a: "OpenCryptoPay transforme n'importe quelle facture ou caisse en un seul QR code que tes clients scannent pour te payer en crypto — Bitcoin, Lightning, Ethereum, Polygon et plus — pendant que tu es réglé dans ta propre monnaie (CHF ou EUR). Aucune intégration ni code.<br><br><b>Pour commencer :</b> 1) Demande OpenCryptoPay (menu &#8594; OpenCryptoPay &#8594; Demander). 2) Une fois approuvé, ajoute une route de versement Lightning. 3) Crée un lien de paiement pour ta caisse ou une facture d'un montant précis, puis télécharge ou imprime le QR.<br><br><b>Comment ton client paie :</b> il scanne le QR avec son téléphone, choisit une blockchain et paie depuis son wallet. Le QR est généré de ton côté et ne contient aucune donnée client — DFX n'apprend le paiement qu'au scan. Tu peux gérer une caisse, imprimer des stickers QR et suivre chaque paiement dans ton historique.",
    },
    {
      c: 'trade',
      q: 'Comment acheter de la crypto ? (étape par étape)',
      a: "1) Connecte ton wallet (ou connecte-toi par e-mail). 2) Choisis la monnaie souhaitée et le montant. 3) DFX affiche les informations de paiement : un bénéficiaire, un IBAN et une <b>référence</b> (un code comme xxxx-xxxx-xxxx). 4) Fais un virement bancaire normal de ce montant et saisis la référence dans le champ prévu. 5) En quelques minutes, jusqu'à un jour ouvré, la crypto arrive directement dans ton propre wallet.<br><br>Pas besoin de compte sur une plateforme, et DFX ne conserve jamais tes pièces.",
    },
    {
      c: 'trade',
      q: "Comment vendre de la crypto ? (et l'erreur la plus fréquente)",
      a: "Sur l'écran Vendre : 1) Choisis la monnaie à vendre et saisis un montant. 2) Indique le compte bancaire (IBAN) où tu veux recevoir l'argent. 3) DFX affiche une <b>adresse de dépôt</b> — copie-la avec l'icône de copie.<br><br><b>Important :</b> envoie d'abord tes pièces depuis ton wallet vers cette adresse. Seul l'envoi déclenche la vente. Beaucoup appuient trop tôt sur le grand bouton de confirmation, avant d'avoir envoyé les pièces — et rien ne se passe. Envoie d'abord un petit montant test, attends l'e-mail de confirmation, puis envoie le reste.",
    },
    {
      c: 'trade',
      q: "Réutilise ta référence : modèles et plan d'épargne",
      a: "Ta référence (le code xxxx-xxxx-xxxx) est permanente — tu peux la réutiliser autant de fois que tu veux, avec n'importe quel montant.<br><br>Astuce : enregistre un modèle de virement à ta banque avec les coordonnées DFX et ta référence, pour que les prochains achats prennent quelques secondes. Avec un ordre permanent (hebdomadaire ou mensuel), tu achètes automatiquement — un simple plan d'épargne crypto.",
    },
    {
      c: 'pay',
      q: "Qu'est-ce que la 'référence' et où la trouver ?",
      a: "La référence est ton code personnel au format <b>xxxx-xxxx-xxxx</b>. Elle indique à DFX quelles pièces livrer, vers quel wallet et sur quel compte. Sans elle, nous ne pouvons pas rapprocher ton virement.<br><br>Tu la vois sur l'écran Acheter avec le bénéficiaire et l'IBAN. Utilise toujours l'icône de copie à côté pour éviter les fautes de frappe, et colle-la dans le champ 'référence' / 'motif' de ta banque.",
    },
    {
      c: 'pay',
      q: "J'ai viré sans la référence",
      a: "Pas d'inquiétude, c'est réparable. Le plus rapide : connecte-toi à ton compte DFX (par e-mail ou wallet) et ajoute ton <b>IBAN</b> dans Réglages → tes comptes bancaires. Une fois que DFX connaît ton IBAN, ton virement est rapproché automatiquement et apparaît comme solde, que tu peux ensuite affecter à ta monnaie.<br><br>Sinon, envoie un second petit virement qui contient bien ta référence.",
    },
    {
      c: 'pay',
      q: "Mon dépôt n'a pas été reconnu (compte tiers ou joint)",
      a: "Pour des raisons réglementaires, un compte bancaire ne peut appartenir qu'à <b>un seul</b> compte DFX, et tu ne peux payer que depuis un compte à <b>ton propre nom</b>.<br><br>- Les paiements d'une tierce personne ou d'un compte d'entreprise sont bloqués.<br>- Un compte joint ne fonctionne que si les deux noms figurent sur le relevé, que l'IBAN n'est pas déjà utilisé sur un autre compte DFX et que notre équipe l'a vérifié.<br><br>Si ton paiement a été retenu, notre service financier vérifie les coordonnées et les débloque pour les prochains dépôts. Utilise un compte à ton nom pour éviter les retards.",
    },
    {
      c: 'pay',
      q: 'Coordonnées bancaires DFX et montants minimums',
      a: "Bénéficiaire : <b>DFX AG</b>.<br>EUR : IBAN CH8583019... (DFX SWISS EUR).<br>CHF : IBAN CH4883019... (DFX SWISS CHF).<br>Indique toujours ta référence (xxxx-xxxx-xxxx).<br><br>L'IBAN exact est toujours affiché sur ton écran Acheter — utilise celui-là. Si tu as enregistré un ancien modèle ou un ordre permanent, mets-le à jour avec le nouvel IBAN.<br><br>Montants minimums : Bitcoin 15 EUR, Lightning 5 EUR, Monero 5 EUR, autres monnaies 15 EUR. Sur l'écran Acheter, tu peux aussi générer un IBAN personnel à ton nom.",
    },
    {
      c: 'pay',
      q: "Revolut affiche 'Sent from Revolut' au lieu de ma référence",
      a: "Revolut remplit le champ référence avec 'Sent from Revolut' par défaut. Avant d'envoyer, remplace ce texte par <b>ta</b> référence (xxxx-xxxx-xxxx). Sinon le premier paiement ne peut être rapproché que lorsque DFX connaît ton IBAN.",
    },
    {
      c: 'account',
      q: 'Combien puis-je acheter sans vérification (limites) ?',
      a: "Sans vérification d'identité (KYC) : jusqu'à <b>1000 CHF par 30 jours</b> (règle introduite en février 2025) et jusqu'à 50'000 CHF par an. Avec KYC : jusqu'à 100'000 CHF par an. La limite annuelle compte sur les 12 derniers mois, pas l'année civile.<br><br>Besoin de plus de 100'000 CHF/an ? Tu peux demander une limite plus élevée et fournir une preuve de l'origine des fonds (menu → Augmenter la limite, ou KYC → limite de trading).",
    },
    {
      c: 'account',
      q: 'Pourquoi me demande-t-on une vérification (KYC) ?',
      a: "Le KYC est un contrôle d'identité unique. Il ne concerne pas le montant, mais toi en tant que personne. Parfois un outil de filtrage des noms signale une correspondance possible (un résultat 'fuzzy') même si ce n'est pas toi ; par sécurité, DFX demande alors le KYC.<br><br>Effectue-le sur <a href='https://app.dfx.swiss/kyc' target='_blank' rel='noopener'>app.dfx.swiss</a> dans le menu KYC. Une fois vérifié, tes limites augmentent et les dépôts suivants se déroulent sans souci.",
    },
    {
      c: 'account',
      q: 'Les nouveaux comptes nécessitent une recommandation',
      a: "Pour ouvrir un compte DFX, il faut désormais la recommandation d'un client existant. À l'étape KYC 'Recommandation', son code de parrainage te sera demandé.<br><br>Choisis quelqu'un que tu connais personnellement et en qui tu as confiance — il garantit que tu es un vrai client, ce qui protège les nouveaux utilisateurs des arnaques. S'il ne sait pas où trouver son code, il peut se connecter et ouvrir une demande de support depuis son compte vérifié.",
    },
    {
      c: 'account',
      q: "J'ai deux comptes DFX / mon IBAN est utilisé dans un autre compte",
      a: "Un IBAN ne peut être lié qu'à un seul compte DFX. Si ton compte bancaire est enregistré sur un autre de tes comptes, les deux comptes doivent être fusionnés.<br><br>Décide quel e-mail garder, puis utilise le lien que DFX t'envoie par e-mail (à l'étape KYC) pour confirmer la fusion. Après la fusion, ton IBAN fonctionne à nouveau. Si l'un des côtés est un compte vérifié, indique les deux comptes dans ta demande pour que notre équipe technique puisse les fusionner.",
    },
    {
      c: 'account',
      q: 'Je suis citoyen américain / résident fiscal des États-Unis',
      a: "Pour des raisons réglementaires (FATCA / IRS), DFX ne peut pas vérifier les citoyens américains ni les personnes assujetties à l'impôt aux États-Unis — même avec un passeport européen. Cela s'applique dès qu'une personne est enregistrée et imposable aux États-Unis (green card, citoyenneté, etc.). DFX n'accepte pas non plus les dépôts en USD.",
    },
    {
      c: 'wallet',
      q: "Mes pièces n'apparaissent pas dans mon wallet (ex. Cake Wallet / Monero)",
      a: "Ton wallet est peut-être encore en synchronisation. Ouvre l'écran du solde et vérifie la barre de statut :<br>- <b>Synchronisé</b> — tout va bien.<br>- <b>Connexion</b> — patiente un instant.<br>- <b>Blocs restants</b> — laisse l'app ouverte sur l'écran du solde jusqu'à 0.<br><br>Si ça n'apparaît toujours pas, lance une nouvelle analyse de la blockchain à partir de 1-2 jours avant ton achat. Si cela ne suffit pas, contacte le support de ton wallet.",
    },
    {
      c: 'wallet',
      q: 'Une nouvelle adresse / sous-adresse est apparue (nouvelle référence)',
      a: "Certains wallets (Cake Wallet est connu pour cela) créent automatiquement une nouvelle sous-adresse, ce qui génère une nouvelle référence. Tu peux le désactiver dans les réglages Confidentialité du wallet ('Subaddresses') et mettre l'app à jour.<br><br>Les adresses et références existantes peuvent simplement être réutilisées, tu n'as donc pas à recommencer à chaque fois.",
    },
    {
      c: 'wallet',
      q: 'Comment lier un nouveau wallet ou une adresse à mon compte ?',
      a: "Si tu commences à utiliser une nouvelle adresse de wallet pas encore vérifiée, tu peux la lier à ton compte vérifié existant pour qu'elle garde le même niveau KYC.<br><br>Sur l'écran Acheter, quand une nouvelle adresse affiche une demande KYC au lieu d'une référence, utilise le bouton <b>'Je suis déjà vérifié chez DFX'</b>, ou ouvre l'étape KYC et saisis l'e-mail de ton compte principal. DFX t'envoie un lien par e-mail — clique dessus pour confirmer la liaison.",
    },
    {
      c: 'wallet',
      q: "Changer d'e-mail ou de téléphone, ou accès e-mail perdu",
      a: "Tu changes ton e-mail ou ton téléphone toi-même dans menu → Réglages → données personnelles. Pour changer l'e-mail, tu dois pouvoir recevoir des messages à la nouvelle adresse.<br><br>Tu as perdu l'accès à l'e-mail de ton compte ? Envoie un petit virement (environ 0,50-1 EUR) depuis ton compte et écris ton <b>e-mail correct</b> dans le champ référence. Cela prouve que la demande vient bien de toi ; notre équipe rétablit ensuite l'accès e-mail.",
    },
    {
      c: 'wallet',
      q: "Trouver l'historique des transactions et ton code de parrainage",
      a: "Connecte-toi par e-mail ou wallet sur <a href='https://app.dfx.swiss/login' target='_blank' rel='noopener'>app.dfx.swiss</a>.<br>- Historique : menu → Transactions. Tu peux aussi exporter un rapport CSV.<br>- Code de parrainage : menu → Compte, fais défiler vers le bas. Un code de parrainage nécessite un compte vérifié et actif (niveau KYC 50) et un peu de ton propre volume. Ne partage ton lien de parrainage qu'avec des personnes que tu connais.",
    },
    {
      c: 'account',
      q: 'Supprimer ou réactiver ton compte ; retirer une adresse',
      a: 'Tu peux supprimer ton compte dans menu → Réglages → Supprimer le compte. Il reçoit une marque de suppression ; par la loi, tes données sont conservées 10 ans. Tu peux le réactiver plus tard en te connectant par e-mail, ou avec un achat ou une vente.<br><br>Retirer une adresse de wallet (Réglages → tes adresses → les trois points → Supprimer) est <b>définitif</b> — une adresse retirée ne peut pas être rajoutée, alors utilise-la avec prudence.',
    },
  ],
};

function issueStateVariant(state: SupportIssueState): 'act' | 'pend' | 'rdy' | 'ina' {
  if (state === SupportIssueState.COMPLETED) return 'act';
  if (state === SupportIssueState.PENDING) return 'pend';
  if (state === SupportIssueState.CREATED) return 'rdy';
  return 'ina';
}

function isClosed(issue: SupportIssue | undefined): boolean {
  return issue?.state === SupportIssueState.COMPLETED || issue?.state === SupportIssueState.CANCELED;
}

function isImageFile(name: string | undefined): boolean {
  return !!name && /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(name);
}

// Save an attachment to disk via a synthetic <a download> (mirrors the static
// app's `chatDownload`) — non-image attachments download rather than opening
// in a new tab.
function downloadFile(url: string, filename: string): void {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename || 'file';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

function retryFileFrom(message: SupportMessage): File | undefined {
  if (!message.fileName || !message.file?.file) return undefined;
  const encoded = message.file.file.includes(',') ? message.file.file.split(',').pop() : message.file.file;
  if (!encoded) return undefined;
  const binary = window.atob(encoded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new File([bytes], message.fileName, { type: message.file.type || 'application/octet-stream' });
}

const ATTACH_ICON = (
  <svg viewBox="0 0 24 24" fill="none">
    <path
      d="M21 12.5 12.5 21a5 5 0 0 1-7-7l8.5-8.5a3.5 3.5 0 0 1 5 5L10.5 18a2 2 0 0 1-3-3l7.5-7.5"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);
const SEND_ICON = (
  <svg viewBox="0 0 24 24" fill="none">
    <path
      d="M4 12 20 4l-4 16-4-6-8-2Z"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);
const FILE_ICON = (
  <svg viewBox="0 0 24 24" fill="none">
    <path d="M14 3v5h5" stroke="currentColor" strokeWidth={1.7} strokeLinejoin="round" />
    <path d="M7 3h8l5 5v13H7z" stroke="currentColor" strokeWidth={1.7} strokeLinejoin="round" />
  </svg>
);
const CHEV_ICON = (
  <svg viewBox="0 0 24 24" fill="none">
    <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const MAIL_ICON = (
  <svg viewBox="0 0 24 24" fill="none">
    <rect x={3} y={5.5} width={18} height={13} rx={3} stroke="currentColor" strokeWidth={1.7} />
    <path
      d="M4.5 8 12 13.2 19.5 8"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);
const DOCS_ICON = (
  <svg viewBox="0 0 24 24" fill="none">
    <path d="M6 3h9l3 3v15H6z" stroke="currentColor" strokeWidth={1.7} strokeLinejoin="round" />
    <path d="M9 11h6M9 15h6" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" />
  </svg>
);
const X_ICON = (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.5 3h3l-6.6 7.5L22 21h-5.9l-4.6-6-5.3 6H3.2l7.1-8.1L2.4 3h6l4.2 5.5L17.5 3Zm-1 16h1.6L7.6 4.7H5.9L16.5 19Z" />
  </svg>
);
const EXT_ICON = (
  <svg className="ext-ic" viewBox="0 0 24 24" fill="none">
    <path d="M7 17 17 7M9 7h8v8" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export default function SupportScreen() {
  return (
    <SupportChatContextProvider>
      <SupportScreenBody />
    </SupportChatContextProvider>
  );
}

function SupportScreenBody() {
  const { t, language } = useT();
  const { showToast } = useToast();
  const { isLoggedIn, address, openConnect } = useWalletSession();
  const { user, updateMail } = useUserContext();
  const { getProfile } = useUser();
  const support = useSupportChatContext();
  const newIssueTitleId = useId();
  const threadTitleId = useId();

  const [newIssueOpen, setNewIssueOpen] = useState(false);
  const [activeUid, setActiveUid] = useState<string | undefined>();
  // Transaction uid carried in from a tx-screen "Report a problem" / "missing" action.
  const [presetTxUid, setPresetTxUid] = useState<string | undefined>();
  const location = useLocation();
  const presetHandledRef = useRef(false);
  const [typeIndex, setTypeIndex] = useState(0);
  const [realName, setRealName] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [formError, setFormError] = useState('');
  // Set when the server rejects the submitted email (or reports a mail-related
  // problem) — re-surfaces the email field even if UserContext still holds a
  // mail, mirroring the static app clearing `USER.mail` on such errors.
  const [emailRejected, setEmailRejected] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [composer, setComposer] = useState('');
  const [pendingFile, setPendingFile] = useState<File | undefined>();
  const [sending, setSending] = useState(false);
  const [sendAttempt, setSendAttempt] = useState<SendAttempt | undefined>();
  const [ticketsError, setTicketsError] = useState('');
  const [threadError, setThreadError] = useState('');
  const [retryingMessageId, setRetryingMessageId] = useState<number | undefined>();
  const [hiddenMessageIds, setHiddenMessageIds] = useState<Set<number>>(() => new Set());
  const [timedOutMessageIds, setTimedOutMessageIds] = useState<Set<number>>(() => new Set());
  const [kbQuery, setKbQuery] = useState('');
  const [kbCat, setKbCat] = useState<KbCat>('all');
  const [kbEnded, setKbEnded] = useState(false);
  const kbChipsRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const supportIssueRef = useRef(support.supportIssue);
  supportIssueRef.current = support.supportIssue;

  useEffect(() => {
    // `support` intentionally omitted — SupportChatContextProvider returns a
    // new object whenever tickets/supportIssue/isLoading/isError change, so
    // depending on it would re-trigger this on every poll tick.
    if (isLoggedIn) {
      setTicketsError('');
      void support.loadTickets().catch(() => setTicketsError(t('loadFail')));
    }
  }, [isLoggedIn]);

  useEffect(() => {
    // Prefetch the verified profile so the new-ticket "Name" field can be
    // prefilled with the user's real first/surname (the `user` object from
    // UserContext carries no name — it lives on the profile endpoint). Best
    // effort: on failure the field falls back to the short wallet address.
    if (!isLoggedIn) return;
    let cancelled = false;
    void getProfile()
      .then((profile) => {
        if (cancelled || !profile) return;
        setRealName([profile.firstName, profile.lastName].filter(Boolean).join(' '));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // `getProfile` intentionally omitted — re-created every render; this should
    // only re-run when the session changes.
  }, [isLoggedIn]);

  useEffect(() => {
    // The SDK's sync path reads the last message without guarding an empty thread.
    support.setSync(shouldSyncSupportIssue(activeUid, support.supportIssue));
    return () => support.setSync(false);
  }, [activeUid, support.supportIssue?.uid, support.supportIssue?.messages.length]);

  useEffect(() => {
    if (!sendAttempt) return;
    if (support.supportIssue?.uid !== sendAttempt.issueUid) return;
    const candidate = findSendCandidate(support.supportIssue.messages, sendAttempt);
    if (!candidate || candidate.status === SupportMessageStatus.SENT) return;

    const succeeded = candidate.status !== SupportMessageStatus.FAILED;
    if (succeeded && sendAttempt.clearComposer) {
      setComposer((current) => (current.trim() === (sendAttempt.text?.trim() ?? '') ? '' : current));
      setPendingFile((current) => (current === sendAttempt.file ? undefined : current));
    }
    if (sendAttempt.replacesMessageId != null) {
      const replacedMessageId = sendAttempt.replacesMessageId;
      setHiddenMessageIds((current) => new Set(current).add(replacedMessageId));
    }
    setTimedOutMessageIds((current) => {
      const next = new Set(current);
      next.delete(candidate.id);
      return next;
    });
    if (!succeeded) showToast(t('genErr'), { assertive: true });
    setSending(false);
    setRetryingMessageId(undefined);
    setSendAttempt(undefined);
  }, [sendAttempt, showToast, support.supportIssue, t]);

  useEffect(() => {
    if (!sendAttempt) return undefined;
    const timeout = window.setTimeout(() => {
      const issueAtTimeout = supportIssueRef.current;
      const candidate =
        issueAtTimeout?.uid === sendAttempt.issueUid
          ? findSendCandidate(issueAtTimeout.messages, sendAttempt)
          : undefined;
      if (candidate?.status === SupportMessageStatus.SENT) {
        setTimedOutMessageIds((current) => new Set(current).add(candidate.id));
      }
      if (sendAttempt.replacesMessageId != null) {
        const replacedMessageId = sendAttempt.replacesMessageId;
        setHiddenMessageIds((current) => new Set(current).add(replacedMessageId));
      }
      showToast(t('genErr'), { assertive: true });
      setSending(false);
      setRetryingMessageId(undefined);
      setSendAttempt(undefined);
    }, SEND_SETTLE_TIMEOUT_MS);
    return () => window.clearTimeout(timeout);
  }, [sendAttempt, showToast, t]);

  useEffect(() => {
    if (!support.supportIssue || timedOutMessageIds.size === 0) return;
    const settledIds = support.supportIssue.messages
      .filter((message) => timedOutMessageIds.has(message.id) && message.status !== SupportMessageStatus.SENT)
      .map((message) => message.id);
    if (!settledIds.length) return;
    setTimedOutMessageIds((current) => {
      const next = new Set(current);
      settledIds.forEach((id) => next.delete(id));
      return next;
    });
  }, [support.supportIssue, timedOutMessageIds]);

  // Toggle the "more topics" scroll affordance once the chip row can no longer
  // scroll further right (mirrors the static app's `updateKbArrow`).
  const updateKbArrow = useCallback(() => {
    const el = kbChipsRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setKbEnded(max <= 6 || el.scrollLeft >= max - 6);
  }, []);

  useEffect(() => {
    updateKbArrow();
  }, [updateKbArrow, kbCat, kbQuery, language]);

  // Auto-grow the chat composer as you type, capped at 120px (mirrors the static
  // app's `autoGrow`); also re-runs when the composer is cleared after a send so
  // the field snaps back to a single row.
  useEffect(() => {
    const el = composerRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [composer, activeUid]);

  const scrollKbChips = () => {
    const el = kbChipsRef.current;
    if (!el) return;
    el.scrollTo({ left: el.scrollLeft + 180, behavior: 'auto' });
    updateKbArrow();
  };

  // When a query is present the category filter is ignored and every article is
  // searched (question + answer); otherwise filter by the selected category.
  const kbQ = kbQuery.trim().toLowerCase();
  const kbArticles = (KB_DATA[language] ?? KB_DATA.en).filter((article) => {
    const matchesQuery = !kbQ || article.q.toLowerCase().includes(kbQ) || article.a.toLowerCase().includes(kbQ);
    const matchesCat = kbQ ? true : kbCat === 'all' || article.c === kbCat;
    return matchesQuery && matchesCat;
  });

  const openNewIssue = () => {
    // Ticket-create is login-gated (mirrors the static app's `openTicket`, which
    // redirects to the connect flow when there is no session).
    if (!isLoggedIn) {
      openConnect();
      return;
    }
    setTypeIndex(0);
    setName(realName || shortAddress(address));
    setEmail('');
    setMessage('');
    setFormError('');
    setEmailRejected(false);
    setPresetTxUid(undefined);
    setNewIssueOpen(true);
  };

  // A tx-screen "Report a problem" / "My transaction is missing" action navigates here with a
  // supportPreset in router state — open the new-ticket form on the matching topic + attach the tx.
  useEffect(() => {
    if (presetHandledRef.current || !isLoggedIn) return;
    const preset = (
      location.state as {
        supportPreset?: { type?: SupportIssueType; reason?: SupportIssueReason; transactionUid?: string };
      } | null
    )?.supportPreset;
    if (!preset) return;
    presetHandledRef.current = true;
    const idx = TICKET_TYPES.findIndex((o) => o.type === preset.type && o.reason === preset.reason);
    openNewIssue();
    if (idx >= 0) setTypeIndex(idx);
    setPresetTxUid(preset.transactionUid);
  }, [location.state, isLoggedIn]);

  const openThread = (uid: string) => {
    setActiveUid(uid);
    setThreadError('');
    setHiddenMessageIds(new Set());
    setTimedOutMessageIds(new Set());
    void support.loadSupportIssue(uid).catch(() => setThreadError(t('loadFail')));
  };

  const closeThread = () => setActiveUid(undefined);

  const submitNewIssue = (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    const trimmedName = name.trim();
    const trimmedMessage = message.trim();
    if (!trimmedName) return;
    if (!trimmedMessage) {
      setFormError(t('tkNeedMsg'));
      return;
    }
    const needsMail = !user?.mail || emailRejected;
    const trimmedEmail = email.trim();
    if (needsMail && !trimmedEmail.includes('@')) {
      setFormError(t('tkNeedMail'));
      return;
    }
    setSubmitting(true);
    setFormError('');
    const create = () => {
      const option = TICKET_TYPES[typeIndex] ?? TICKET_TYPES[0];
      const request: CreateSupportIssue = {
        type: option.type,
        reason: option.reason,
        name: trimmedName,
        message: trimmedMessage,
        ...(presetTxUid ? { transaction: { uid: presetTxUid } } : {}),
      };
      return support.createSupportIssue(request);
    };
    (needsMail ? updateMail(trimmedEmail).then(create) : create())
      .then((uid) => {
        setNewIssueOpen(false);
        showToast(t('tkSentToast'));
        openThread(uid);
      })
      .catch((err: unknown) => {
        if (err instanceof ApiException && err.statusCode === 409) {
          // Email already registered on another account — keep the field visible.
          setEmailRejected(true);
          setFormError(t('mailTaken'));
          return;
        }
        const serverMessage = err instanceof Error ? err.message : '';
        if (serverMessage && /mail/i.test(serverMessage)) {
          // Mail-related rejection — re-surface the email field so it can be fixed.
          setEmailRejected(true);
          setFormError(t('tkNeedMail'));
          return;
        }
        // Surface the server's own error text alongside the generic note.
        setFormError(serverMessage ? `${t('tkErr')}: ${serverMessage}` : t('tkErr'));
      })
      .finally(() => setSubmitting(false));
  };

  const onPickFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      showToast(t('chatFileBig'));
      return;
    }
    setPendingFile(file);
  };

  const issue = support.supportIssue;
  const closed = isClosed(issue);

  const startSend = (
    text: string | undefined,
    file: File | undefined,
    clearComposer: boolean,
    retryMessageId?: number,
  ) => {
    if (sending || (!text && !file) || closed || !issue) return;
    const attempt: SendAttempt = {
      issueUid: issue.uid,
      beforeIds: issue.messages.map((existing) => existing.id),
      text,
      file,
      clearComposer,
      startedAt: Date.now(),
      replacesMessageId: retryMessageId,
    };
    setSending(true);
    setRetryingMessageId(retryMessageId);
    setSendAttempt(attempt);
    void support.submitMessage(text, file ? [file] : undefined).catch(() => {
      showToast(t('genErr'), { assertive: true });
      setSending(false);
      setRetryingMessageId(undefined);
      setSendAttempt(undefined);
    });
  };

  const send = () => startSend(composer.trim() || undefined, pendingFile, true);

  const retryMessage = (failedMessage: SupportMessage) => {
    if (sending) return;
    try {
      const file = failedMessage.fileName ? retryFileFrom(failedMessage) : undefined;
      if (failedMessage.fileName && !file) throw new Error('Missing local attachment');
      startSend(failedMessage.message?.trim() || undefined, file, false, failedMessage.id);
    } catch {
      showToast(t('genErr'), { assertive: true });
    }
  };

  return (
    <div className="account">
      <div className="txhead">
        <h2>{t('mSupport')}</h2>
      </div>
      <p className="tnote" style={{ padding: '0 4px 6px' }}>
        {t('supportLead')}
      </p>

      <div className="search" style={{ margin: '2px 4px 14px' }}>
        <svg viewBox="0 0 24 24" fill="none">
          <circle cx={11} cy={11} r={7} stroke="currentColor" strokeWidth={1.8} />
          <path d="M20 20l-3.2-3.2" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
        </svg>
        <input
          value={kbQuery}
          onChange={(e) => setKbQuery(e.target.value)}
          placeholder={t('searchHelp')}
          aria-label={t('searchHelp')}
        />
      </div>
      <div className="sectionlabel">{t('faqTitle')}</div>
      <div className={`kbchips-wrap${kbEnded ? ' ended' : ''}`}>
        <div className="kbchips" ref={kbChipsRef} onScroll={updateKbArrow}>
          {KB_CATS.map((cat) => (
            <button
              key={cat}
              type="button"
              className={`kbchip${cat === kbCat ? ' on' : ''}`}
              onClick={() => setKbCat(cat)}
            >
              {t(`kc_${cat}` as TranslationKey)}
            </button>
          ))}
        </div>
        <button
          className={`kbchip-arrow${kbEnded ? ' hide' : ''}`}
          type="button"
          aria-label="More topics"
          onClick={scrollKbChips}
        >
          <svg viewBox="0 0 24 24" fill="none">
            <path
              d="M9 6l6 6-6 6"
              stroke="currentColor"
              strokeWidth={2.4}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
      <div className="glass faq" style={{ padding: '2px 4px' }}>
        {kbArticles.length === 0 ? (
          <div className="ans" style={{ padding: '14px 12px', color: 'var(--t-muted)' }}>
            {t('kbNoResults')}
          </div>
        ) : (
          kbArticles.map((article, index) => (
            <details key={`${article.c}-${index}`}>
              <summary>
                {article.q}
                <svg className="chev" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M7 10l5 5 5-5"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </summary>
              {/* Answers are trusted, author-controlled HTML bundled in KB_DATA (mirrors the static app's kb.json). */}
              <div className="ans" dangerouslySetInnerHTML={{ __html: article.a }} />
            </details>
          ))
        )}
      </div>

      {isLoggedIn && (
        <>
          <div className="sectionlabel">{t('myTickets')}</div>
          {ticketsError ? (
            <div className="glass tkempty" style={{ flexDirection: 'column', gap: 10 }}>
              <span>{ticketsError}</span>
              <button
                className="btn-mini"
                type="button"
                onClick={() => {
                  setTicketsError('');
                  void support.loadTickets().catch(() => setTicketsError(t('loadFail')));
                }}
              >
                {t('retry')}
              </button>
            </div>
          ) : support.isLoading && support.tickets.length === 0 ? (
            <div className="glass tkempty">
              <LoadingRow label={t('loading')} />
            </div>
          ) : support.tickets.length === 0 ? (
            <div className="glass tkempty">{t('noTickets')}</div>
          ) : (
            [...support.tickets]
              .sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime())
              .map((ticket) => {
                const preview = ticket.messages[ticket.messages.length - 1];
                const previewText = preview?.message ?? (preview?.fileName ? `📎 ${preview.fileName}` : '');
                return (
                  <button key={ticket.uid} type="button" className="tkrow glass" onClick={() => openThread(ticket.uid)}>
                    <span className="tx">
                      <span className="top">
                        <b>{issueTypeLabel(t, ticket.type)}</b>
                        <span className={`pill-chip ${issueStateVariant(ticket.state)}`}>
                          {t(`is_${ticket.state}` as TranslationKey)}
                        </span>
                      </span>
                      <small>{formatDateTime(ticket.created, language)}</small>
                      {previewText && <small className="prev">{previewText}</small>}
                    </span>
                    <span className="chev">{CHEV_ICON}</span>
                  </button>
                );
              })
          )}
        </>
      )}

      <div className="sectionlabel">{t('contactTitle')}</div>
      <div
        className="suprow glass"
        role="button"
        tabIndex={0}
        onClick={openNewIssue}
        onKeyDown={onActivate(openNewIssue)}
      >
        <span className="ic">
          <svg viewBox="0 0 24 24" fill="none">
            <path
              d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.7A8.5 8.5 0 1 1 21 11.5Z"
              stroke="currentColor"
              strokeWidth={1.7}
            />
          </svg>
        </span>
        <span className="tx">
          <b>{t('supTicket')}</b>
          <small>{t('supTicketSub')}</small>
        </span>
        <span className="ext-ic">{CHEV_ICON}</span>
      </div>
      <a className="suprow glass" href="mailto:support@dfx.swiss">
        <span className="ic">{MAIL_ICON}</span>
        <span className="tx">
          <b>{t('supEmail')}</b>
          <small>support@dfx.swiss</small>
        </span>
        {EXT_ICON}
      </a>
      <a className="suprow glass" href="https://docs.dfx.swiss/" target="_blank" rel="noopener noreferrer">
        <span className="ic">{DOCS_ICON}</span>
        <span className="tx">
          <b>{t('supDocs')}</b>
          <small>docs.dfx.swiss</small>
        </span>
        {EXT_ICON}
      </a>
      <a className="suprow glass" href="https://x.com/DFX_Swiss" target="_blank" rel="noopener noreferrer">
        <span className="ic">{X_ICON}</span>
        <span className="tx">
          <b>{t('supX')}</b>
          <small>x.com/DFX_Swiss</small>
        </span>
        {EXT_ICON}
      </a>
      <div className="supfoot">{t('supFoot')}</div>

      {/* ---- create-issue sheet ---- */}
      <Sheet open={newIssueOpen} onClose={() => setNewIssueOpen(false)} titleId={newIssueTitleId}>
        <SheetHeader titleId={newIssueTitleId} title={t('newTicket')} onClose={() => setNewIssueOpen(false)} />
        <p className="tnote" style={{ padding: '0 4px 8px' }}>
          {t('ticketLead')}
        </p>
        <form className="tform" onSubmit={submitNewIssue}>
          <label className="flabel">{t('ticketTopic')}</label>
          <select
            className="tinput"
            value={typeIndex}
            onChange={(e) => setTypeIndex(Number(e.target.value))}
            aria-label={t('ticketTopic')}
          >
            {TICKET_TYPES.map((opt, i) => (
              <option key={opt.key} value={i}>
                {t(opt.key)}
              </option>
            ))}
          </select>
          {(!user?.mail || emailRejected) && (
            <>
              <label className="flabel">{t('ticketEmail')}</label>
              <input
                className="tinput"
                type="email"
                placeholder="you@email.com"
                autoComplete="email"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-label={t('ticketEmail')}
              />
            </>
          )}
          <label className="flabel">{t('ticketName')}</label>
          <input
            className="tinput"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            aria-label={t('ticketName')}
          />
          <label className="flabel">{t('ticketMsg')}</label>
          <textarea
            className="tinput"
            rows={6}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            aria-label={t('ticketMsg')}
          />
          <button className="btn-primary" type="submit" style={{ marginTop: 8 }} disabled={submitting}>
            {submitting ? <LoadingRow label={t('tkSending')} /> : t('submitTicket')}
          </button>
          {formError && <div className="paybox-note warn">{formError}</div>}
        </form>
      </Sheet>

      {/* ---- chat thread sheet ---- */}
      <Sheet open={!!activeUid} onClose={closeThread} titleId={threadTitleId} showGrab={false}>
        <div className="chatwrap">
          <div className="chathead">
            <button className="rbtn" aria-label="Back" style={{ width: 40, height: 40 }} onClick={closeThread}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <h2 id={threadTitleId}>{issue ? issueTypeLabel(t, issue.type) : t('chatTitle')}</h2>
          </div>
          <div className="chatthread" aria-live="polite">
            {support.isError && issue && <div className="paybox-note warn">{t('loadFail')}</div>}
            {threadError ? (
              <div className="chatempty">
                <span>{t('loadFail')}</span>
                {activeUid && (
                  <button
                    className="btn-mini"
                    type="button"
                    style={{ marginTop: 10 }}
                    onClick={() => openThread(activeUid)}
                  >
                    {t('retry')}
                  </button>
                )}
              </div>
            ) : support.isLoading && !issue ? (
              <div className="chatempty">
                <LoadingRow label={t('loading')} />
              </div>
            ) : !issue || issue.messages.length === 0 ? (
              <div className="chatempty">{t('chatEmpty')}</div>
            ) : (
              issue.messages
                .filter((message) => !hiddenMessageIds.has(message.id))
                .map((m) => (
                  <ChatBubble
                    key={m.id}
                    message={m}
                    language={language}
                    retrying={retryingMessageId === m.id}
                    deliveryTimedOut={timedOutMessageIds.has(m.id)}
                    onRetry={() => retryMessage(m)}
                    onLoadFile={() => support.loadFileData(m.id)}
                  />
                ))
            )}
          </div>
          {closed ? (
            <div className="chatclosed">{t('chatClosed')}</div>
          ) : (
            <>
              {pendingFile && (
                <div className="chatattach">
                  <span>{pendingFile.name}</span>
                  <span className="rm" role="button" tabIndex={0} onClick={() => setPendingFile(undefined)}>
                    ✕
                  </span>
                </div>
              )}
              <div className="chatcomposer">
                <input
                  id="chatFileInput"
                  type="file"
                  accept="image/*,application/pdf"
                  style={{ display: 'none' }}
                  onChange={onPickFile}
                />
                <button
                  className="chaticon"
                  aria-label="Attach file"
                  type="button"
                  onClick={() => document.getElementById('chatFileInput')?.click()}
                >
                  {ATTACH_ICON}
                </button>
                <textarea
                  ref={composerRef}
                  rows={1}
                  aria-label="Message"
                  placeholder={t('chatPlaceholder')}
                  value={composer}
                  onChange={(e) => setComposer(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                />
                <button className="chaticon chatsend" aria-label="Send" type="button" disabled={sending} onClick={send}>
                  {SEND_ICON}
                </button>
              </div>
            </>
          )}
        </div>
      </Sheet>
    </div>
  );
}

function ChatBubble({
  message,
  language,
  retrying,
  deliveryTimedOut,
  onRetry,
  onLoadFile,
}: {
  message: SupportMessage;
  language: Language;
  retrying: boolean;
  deliveryTimedOut: boolean;
  onRetry: () => void;
  onLoadFile: () => Promise<void>;
}) {
  const { t } = useT();
  const { showToast } = useToast();
  const [loadedUrl, setLoadedUrl] = useState<string | undefined>(message.file?.url);
  const [loading, setLoading] = useState(false);
  const mine = message.author === 'Customer';
  const failed = message.status === SupportMessageStatus.FAILED || deliveryTimedOut;
  const timestamp = formatDateTime(message.created, language);

  // `onLoadFile` mutates the message inside SupportChatContext and the new
  // `message` prop arrives on the next render — read it here instead of in
  // the `.then()` below, which would otherwise close over the stale prop.
  useEffect(() => {
    if (message.file?.url) setLoadedUrl(message.file.url);
  }, [message.file?.url]);

  // Auto-load image attachments on mount (mirrors the static app's
  // `chatHydrateAttach`): any message carrying an image renders inline without a
  // tap. The bytes arrive on the mutated `message.file.url`, which the sync
  // effect above then promotes to `loadedUrl`. `onLoadFile` is intentionally
  // omitted from deps (re-created every render); re-run only per message.
  useEffect(() => {
    if (message.file?.url || !message.fileName || !isImageFile(message.fileName)) return;
    let cancelled = false;
    setLoading(true);
    void onLoadFile()
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [message.id, message.fileName]);

  const ensureLoaded = () => {
    if (loading || !message.fileName) return;
    const fileName = message.fileName;
    const image = isImageFile(fileName);
    if (loadedUrl) {
      if (!image) downloadFile(loadedUrl, fileName);
      return;
    }
    setLoading(true);
    onLoadFile()
      .then(() => {
        const nextUrl = message.file?.url;
        if (!nextUrl) throw new Error('Attachment data missing');
        setLoadedUrl(nextUrl);
        if (!image) downloadFile(nextUrl, fileName);
      })
      .catch(() => {
        showToast(t('loadFail'), { assertive: true });
      })
      .finally(() => setLoading(false));
  };

  return (
    <div className={`msg ${mine ? 'msg-cust' : 'msg-supp'}${failed ? ' failed' : ''}`}>
      <div className="msg-bubble">
        {message.message && <div className="msg-tx">{message.message}</div>}
        {message.fileName &&
          (isImageFile(message.fileName) && loadedUrl ? (
            <img className="msg-img" alt={message.fileName} src={loadedUrl} />
          ) : (
            <div
              className="msg-file"
              role="button"
              tabIndex={0}
              onClick={ensureLoaded}
              onKeyDown={onActivate(ensureLoaded)}
            >
              {FILE_ICON}
              <span>{loading ? t('loading') : message.fileName}</span>
            </div>
          ))}
        <div className="msg-meta">
          {timestamp}
          {message.status === SupportMessageStatus.SENT && !deliveryTimedOut && ` · ${t('chatSending')}`}
          {failed && (
            <>
              {' · '}
              <button className="msg-retry" type="button" disabled={retrying} onClick={onRetry}>
                {retrying ? t('chatSending') : t('chatRetry')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
