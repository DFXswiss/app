# Review completion

## English

The author review-completion comment is defined in DFXswiss/agent. This note only shows that
comment on a pull request in this repository. It does not change the application.

The comment has six visible lines: `EN:`, `Ready after N review passes.`, one summary line, `DE:`,
`Bereit nach N Review-Durchläufen.`, and one summary line. `N` is `passes`, the number of review
rounds, not the number of lanes. One JSON object between `<!-- A38-REVIEW:v1 -->` and
`<!-- /A38-REVIEW:v1 -->` names the current head, `passes`, `defects` 0, and the four lanes
`conformity-a`, `logic-a`, `conformity-b`, and `logic-b`, each once. A pass lane is `result`
`pass` and `status` `complete`. An optional details section follows the JSON object.

The issue comment on this pull request is that comment for the current head.

## Deutsch

Der Review-Abschlusskommentar des Autors ist in DFXswiss/agent festgelegt. Diese Notiz zeigt
diesen Kommentar nur auf einem Pull Request in diesem Repository. Sie ändert die Anwendung nicht.

Der Kommentar hat sechs sichtbare Zeilen: `EN:`, `Ready after N review passes.`, eine
Zusammenfassungszeile, `DE:`, `Bereit nach N Review-Durchläufen.` und eine Zusammenfassungszeile.
`N` ist `passes`, die Zahl der Review-Runden, nicht die Zahl der Lanes. Ein JSON-Objekt zwischen
`<!-- A38-REVIEW:v1 -->` und `<!-- /A38-REVIEW:v1 -->` nennt den aktuellen Head, `passes`,
`defects` 0 und die vier Lanes `conformity-a`, `logic-a`, `conformity-b` und `logic-b`, je einmal.
Eine bestandene Lane hat `result` `pass` und `status` `complete`. Ein optionaler Details-Abschnitt
folgt auf das JSON-Objekt.

Der Issue-Kommentar auf diesem Pull Request ist dieser Kommentar für den aktuellen Head.
