import { CallQueue } from '@dfx.swiss/react';
import { DecisionQueue } from 'src/util/call-queue.util';

const disclaimer =
  'Disclaimer: Kunden darauf hinweisen, dass sie wahrheitsgemäss antworten müssen, ansonsten Möglichkeit sich strafbar zu machen (Geldwäsche/Identitätsdiebstahl)';

const coreQuestions = [
  'Wie sind Sie ursprünglich auf unsere Plattform bzw. unseren Service aufmerksam geworden?',
  'Was hat Sie dazu bewegt, diese Transaktion bzw. Investition jetzt vorzunehmen?',
  'Fühlen Sie sich unwohl oder unter Druck gesetzt, um diese Investition zu tätigen oder dieses Geld zu überweisen?',
  'Wie haben Sie Ihr Konto bei uns eingerichtet? Hatten Sie hierfür Hilfe von jemandem?',
  'Wer nutzt das Konto üblicherweise oder hat Zugriff darauf?',
  'Wurde Ihr Computer oder Ihr Gerät kürzlich von jemand anderem verwendet oder unterstützt? (z. B. über AnyDesk oder ähnliche Programme)?',
  'Gibt es aktuell Personen, mit denen Sie sich über Geldanlagen oder Finanzthemen austauschen? Hat Ihnen jemand lukrative Investitionen versprochen? Verlangt jemand von Ihnen zusätzliches Geld, um angeblich andere Gelder freizugeben oder abheben zu können?',
  'Gibt es im Zusammenhang mit dieser Transaktion zusätzliche Zahlungen oder Anforderungen, von denen Sie uns erzählen möchten?',
];

const confirmMail = 'Können Sie mir Ihre E-Mail-Adresse bestätigen?';
const ipSystemNotice =
  'Unser System hat ungewöhnliche Aktivitäten festgestellt, daher können wir die Transaktion momentan nicht ausführen';

// A Callback item asks the questions of the reason queue it was parked from (effectiveCallQueue).
export const callQueueQuestions: Record<DecisionQueue, string[]> = {
  [CallQueue.MANUAL_CHECK_PHONE]: [disclaimer, ...coreQuestions, confirmMail],
  [CallQueue.MANUAL_CHECK_IP_PHONE]: [disclaimer, ...coreQuestions, ipSystemNotice],
  [CallQueue.MANUAL_CHECK_IP_COUNTRY_PHONE]: [disclaimer, ...coreQuestions],
  [CallQueue.MANUAL_CHECK_EXTERNAL_ACCOUNT_PHONE]: [disclaimer, ...coreQuestions, confirmMail],
};
