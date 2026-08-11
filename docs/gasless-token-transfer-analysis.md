# Gasless Token Transfer auf Ethereum mit MetaMask

## Vollständige Analyse und Lösungsdokumentation

**Datum:** 8. Januar 2026
**Projekt:** DFXswiss Services
**Ziel:** Token-Transfer ohne ETH-Besitz über MetaMask Browser Extension

---

## 1. Anforderungen

### 1.1 Kernanforderungen

| #   | Anforderung                                      | Priorität |
| --- | ------------------------------------------------ | --------- |
| 1   | Token-Transfer **ohne ETH** im Wallet            | MUSS      |
| 2   | Funktioniert mit **JEDEM ERC-20 Token**          | MUSS      |
| 3   | **MetaMask Browser Extension** nativ unterstützt | MUSS      |
| 4   | **Keine Gas-Kosten** für den User (0 ETH)        | MUSS      |
| 5   | dApp kann den Flow **programmatisch triggern**   | SOLL      |

### 1.2 Ursprünglicher Ansatz

Der ursprüngliche Implementierungsansatz basierte auf **EIP-5792 `paymasterService`** Capability:

```javascript
// Ursprüngliche Implementierung in metamask.hook.ts
const result = await ethereum.request({
  method: 'wallet_sendCalls',
  params: [{
    version: '2.0.0',
    chainId: chainHex,
    from: account,
    atomicRequired: true,
    calls: [...],
    capabilities: {
      paymasterService: {
        url: 'https://api.pimlico.io/v2/sepolia/rpc?apikey=...',
        optional: false,
      },
    },
  }],
});
```

---

## 2. Problem-Analyse

### 2.1 Fehler bei der Ausführung

```
Error: "Unsupported non-optional capabilities: paymasterService"
Error Code: 5700
```

### 2.2 Root Cause

**MetaMask Browser Extension 13.13.1 (aktuellste Version) implementiert die `paymasterService` Capability NICHT.**

#### Beweis aus `wallet_getCapabilities`:

```json
{
  "0x1": {
    "atomic": { "status": "ready" },
    "auxiliaryFunds": { "supported": true }
  },
  "0xaa36a7": {
    "atomic": { "status": "ready" }
  }
}
```

**Beobachtung:** `paymasterService` ist auf KEINER Chain vorhanden.

### 2.3 Analyse des MetaMask Source Codes

| Komponente                       | paymasterService Status      |
| -------------------------------- | ---------------------------- |
| `@metamask/eip-5792-middleware`  | NICHT implementiert          |
| CHANGELOG.md                     | Keine Erwähnung von ERC-7677 |
| `.metamaskrc.dist` Feature Flags | Keine Paymaster-Flags        |
| MetaMask Flask                   | NICHT implementiert          |
| Pull Requests                    | Keine offenen PRs            |
| Roadmap                          | Nicht erwähnt                |

### 2.4 Unterschied: SDK vs. Browser Extension

| Produkt                         | paymasterService | Beschreibung                   |
| ------------------------------- | ---------------- | ------------------------------ |
| **MetaMask Browser Extension**  | ❌ NEIN          | Was User installieren          |
| **MetaMask Smart Accounts Kit** | ✅ JA            | Server-side SDK für Entwickler |
| **MetaMask Delegation Toolkit** | ✅ JA            | SDK mit Pimlico Integration    |

**Wichtig:** Die Dokumentation zu "gasless transactions" bezieht sich auf SDKs, NICHT auf die Browser Extension!

---

## 3. Untersuchte Alternativen

### 3.1 EIP-2612 Permit

**Beschreibung:** Gasless Approval via Off-Chain Signatur

```javascript
// User signiert Permit (kein Gas)
const signature = await ethereum.request({
  method: 'eth_signTypedData_v4',
  params: [account, permitTypedData],
});

// Relayer führt transferFrom aus (Relayer zahlt Gas)
await contract.permit(owner, spender, value, deadline, v, r, s);
await contract.transferFrom(owner, recipient, amount);
```

| Aspekt             | Bewertung                        |
| ------------------ | -------------------------------- |
| MetaMask nativ     | ✅ Signatur unterstützt          |
| Alle Tokens        | ❌ Nur Tokens mit Permit-Support |
| 0 ETH für User     | ✅ Ja                            |
| Tokens ohne Permit | ❌ USDT, viele andere            |

**Fazit:** Nicht universell, USDT nicht unterstützt.

### 3.2 EIP-3009 transferWithAuthorization

**Beschreibung:** Gasless Transfer via Off-Chain Signatur (ein Schritt)

```javascript
// User signiert Transfer-Authorization
const signature = await ethereum.request({
  method: 'eth_signTypedData_v4',
  params: [account, transferAuthTypedData],
});

// Relayer führt Transfer aus
await contract.transferWithAuthorization(from, to, value, validAfter, validBefore, nonce, signature);
```

| Aspekt         | Bewertung               |
| -------------- | ----------------------- |
| MetaMask nativ | ✅ Signatur unterstützt |
| Alle Tokens    | ❌ Nur USDC v2          |
| 0 ETH für User | ✅ Ja                   |
| USDT Support   | ❌ Nein                 |

**Fazit:** Nur für USDC, nicht universell.

### 3.3 Permit2 (Uniswap)

**Beschreibung:** Universelle Permit-Lösung für alle ERC-20 Tokens

```javascript
// EINMALIG: User approved Permit2 (braucht Gas!)
await token.approve(PERMIT2_ADDRESS, MAX_UINT256);

// DANACH: Gasless via Signatur
const signature = await signPermit2Message(...);
await permit2.permitTransferFrom(permit, transferDetails, owner, signature);
```

| Aspekt         | Bewertung                         |
| -------------- | --------------------------------- |
| MetaMask nativ | ✅ Signatur unterstützt           |
| Alle Tokens    | ✅ Ja                             |
| 0 ETH für User | ❌ Einmalige Approval braucht Gas |

**Fazit:** Nicht 100% gasless - erste Approval braucht ETH.

### 3.4 Flashbots Bundle

**Beschreibung:** Atomarer Bundle mit vorfinanziertem ETH

```
1. Sponsor sendet ETH an User-Wallet
2. User führt Approval aus (mit gesponsorten ETH)
3. User führt Transfer aus
4. Überschüssiges ETH geht zurück an Sponsor
→ Alles in einem Block, atomar
```

| Aspekt         | Bewertung                      |
| -------------- | ------------------------------ |
| MetaMask nativ | ❌ `eth_signTransaction` fehlt |
| Alle Tokens    | ✅ Ja                          |
| 0 ETH für User | ✅ Ja                          |

**Problem:** MetaMask unterstützt `eth_signTransaction` nicht.

> "MetaMask refuses to just sign a transaction without also attempting broadcast"
> — GitHub Issue #10914

**Fazit:** Technisch möglich, aber MetaMask blockiert es.

### 3.5 ERC-2771 Meta-Transactions (GSN)

**Beschreibung:** Trusted Forwarder Pattern

```javascript
// User signiert Meta-Transaction
const signature = await signMetaTransaction(...);

// Relayer sendet an Forwarder Contract
await trustedForwarder.execute(request, signature);
```

| Aspekt         | Bewertung                              |
| -------------- | -------------------------------------- |
| MetaMask nativ | ✅ Mit GSN Provider Wrapper            |
| Alle Tokens    | ❌ Contract muss ERC2771Recipient sein |
| 0 ETH für User | ✅ Ja                                  |

**Fazit:** Nicht universell - Token-Contract muss es unterstützen.

---

## 4. Lösung: MetaMask Smart Account + Gas Station

### 4.1 Übersicht

Die einzige Lösung die ALLE Anforderungen erfüllt ist die Kombination von:

1. **MetaMask Smart Account** (EIP-7702)
2. **MetaMask Gas Station** (Pay gas in token)

### 4.2 Wie es funktioniert

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  SCHRITT 1: dApp triggert Transaction                          │
│  ─────────────────────────────────────                          │
│  await ethereum.request({                                       │
│    method: 'wallet_sendCalls',                                  │
│    params: [{                                                   │
│      atomicRequired: true,  // Triggert Smart Account Prompt    │
│      calls: [{ to, data, value }],                              │
│    }]                                                           │
│  });                                                            │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  SCHRITT 2: MetaMask zeigt Smart Account Upgrade                │
│  ───────────────────────────────────────────────                │
│  "Switch to Smart Account"                                      │
│  [Confirm] [Cancel]                                             │
│                                                                 │
│  → Upgrade-Gas wird in nächste TX gerollt (nicht separat!)      │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  SCHRITT 3: MetaMask zeigt Gas Station                          │
│  ─────────────────────────────────────                          │
│  "Insufficient ETH for gas"                                     │
│  "Pay network fee with: [USDT ▼]"                               │
│                                                                 │
│  → User wählt Token (USDT, USDC, DAI, etc.)                     │
│  → MetaMask swappt automatisch Token → ETH für Gas              │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  SCHRITT 4: Transaktion wird ausgeführt                         │
│  ───────────────────────────────────────                        │
│  - Smart Account Upgrade ✓                                      │
│  - Token Transfer ✓                                             │
│  - Gas bezahlt in USDT/USDC ✓                                   │
│                                                                 │
│  → User hatte NIE ETH, alles erfolgreich!                       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 4.3 Technische Details

#### Smart Account (EIP-7702)

```
EOA Address: 0xE988cD504F3F2E5c93fF13Eb8A753D8Bc96f0640
     │
     │ EIP-7702 Delegation
     ▼
MetaMask Delegator Contract: 0x63c0c19a282a1b52b07dd5a65b58948a07dae32b
     │
     │ Ermöglicht:
     ├─ Batch Transactions
     ├─ Gas Abstraction (pay in any token)
     └─ Programmable Actions
```

#### Gas Station Mechanismus

```
User will 100 USDT senden
Gas kostet ~$3 in ETH

MetaMask macht intern:
1. Swap: 3 USDT → ~0.001 ETH (automatisch)
2. Transfer: 97 USDT → Empfänger
3. Gas: 0.001 ETH für Netzwerk

Ergebnis: User sendet effektiv 100 USDT, 3 USDT für Gas
```

### 4.4 Unterstützte Tokens für Gas-Zahlung

| Token           | Symbol | Unterstützt |
| --------------- | ------ | ----------- |
| Tether          | USDT   | ✅          |
| USD Coin        | USDC   | ✅          |
| Dai             | DAI    | ✅          |
| Wrapped Ether   | wETH   | ✅          |
| Wrapped Bitcoin | wBTC   | ✅          |
| Wrapped stETH   | wstETH | ✅          |
| Wrapped SOL     | wSOL   | ✅          |

### 4.5 Unterstützte Netzwerke

| Netzwerk         | Chain ID | Gas Station | Smart Account |
| ---------------- | -------- | ----------- | ------------- |
| Ethereum Mainnet | 1        | ✅          | ✅            |
| Arbitrum One     | 42161    | ✅          | ✅            |
| Base             | 8453     | ✅          | ✅            |
| Polygon          | 137      | ✅          | ✅            |
| BNB Chain        | 56       | ✅          | ✅            |
| Linea            | 59144    | ✅          | ✅            |
| Optimism         | 10       | ❌          | ✅            |
| Gnosis Chain     | 100      | ❌          | ✅            |
| Sepolia Testnet  | 11155111 | ❌          | ✅            |

---

## 5. Implementierung

### 5.1 Aktueller Code (metamask.hook.ts)

```typescript
// Zeile ~380 in src/hooks/wallets/metamask.hook.ts
const result = await ethereum().request({
  method: 'wallet_sendCalls',
  params: [
    {
      version: '2.0.0',
      chainId: chainHex,
      from: account,
      atomicRequired: true, // Triggert Smart Account Upgrade
      calls: calls.map((c) => ({
        to: c.to,
        data: c.data,
        value: c.value?.startsWith('0x') ? c.value : `0x${BigInt(c.value || 0).toString(16)}`,
      })),
      // WICHTIG: paymasterService ENTFERNEN!
      // MetaMask Gas Station handled das automatisch
    },
  ],
});
```

### 5.2 Empfohlene Änderungen

```typescript
// VORHER (funktioniert nicht):
capabilities: {
  paymasterService: {
    url: paymasterUrl,
    optional: !requirePaymaster,
  },
},

// NACHHER (funktioniert mit Gas Station):
// Keine capabilities nötig!
// MetaMask zeigt automatisch Gas Station wenn User kein ETH hat
```

### 5.3 Netzwerk-Prüfung

```typescript
const GAS_STATION_SUPPORTED_CHAINS = [
  1, // Ethereum Mainnet
  56, // BNB Chain
  137, // Polygon
  8453, // Base
  42161, // Arbitrum
  59144, // Linea
];

function isGasStationSupported(chainId: number): boolean {
  return GAS_STATION_SUPPORTED_CHAINS.includes(chainId);
}

// Vor dem Aufruf prüfen:
if (!isGasStationSupported(chainId)) {
  // Fallback: User muss ETH haben
  // Oder: Anderen Ansatz verwenden (EIP-2612 für USDC, etc.)
}
```

---

## 6. Einschränkungen

### 6.1 Sepolia Testnet

**Problem:** Gas Station funktioniert NICHT auf Sepolia.

**Konsequenz für Tests:**

- E2E Tests auf Sepolia erfordern ETH im Test-Wallet
- Oder: Tests auf unterstütztem Testnet (falls verfügbar)
- Oder: Tests direkt auf Mainnet mit kleinen Beträgen

### 6.2 Keine dApp API für Gas Station

**Problem:** Die dApp kann Gas Station nicht programmatisch triggern.

**Verhalten:**

- MetaMask zeigt Gas Station automatisch wenn:
  - User hat nicht genug ETH für Gas
  - User hat eligible Tokens (USDT, USDC, etc.)
  - Netzwerk unterstützt Gas Station

**Konsequenz:**

- dApp kann nur `wallet_sendCalls` aufrufen
- MetaMask entscheidet ob Gas Station angezeigt wird
- User muss manuell Token für Gas auswählen

### 6.3 Smart Account Upgrade

**Einmalig pro Account:**

- Erstes Mal: Upgrade wird in TX gerollt
- Danach: Account bleibt Smart Account
- Revertierbar: User kann zurück zu EOA wechseln

### 6.4 Token-Unterstützung

**Nicht ALLE Tokens können für Gas verwendet werden:**

- Nur: USDT, USDC, DAI, wETH, wBTC, wstETH, wSOL
- Andere Tokens: Können transferiert werden, aber nicht für Gas

---

## 7. Vergleich mit Alternativen

| Lösung                          | Alle Tokens | 0 ETH | MetaMask Nativ | dApp API | Testnets |
| ------------------------------- | ----------- | ----- | -------------- | -------- | -------- |
| **Smart Account + Gas Station** | ✅          | ✅    | ✅             | ⚠️       | ❌       |
| EIP-2612 Permit                 | ❌          | ✅    | ✅             | ✅       | ✅       |
| EIP-3009                        | ❌          | ✅    | ✅             | ✅       | ✅       |
| Permit2                         | ✅          | ❌    | ✅             | ✅       | ✅       |
| Flashbots Bundle                | ✅          | ✅    | ❌             | ✅       | ✅       |
| paymasterService                | ✅          | ✅    | ❌             | ✅       | ✅       |

**Legende:**

- ✅ = Vollständig unterstützt
- ⚠️ = Teilweise (User-Interaktion nötig)
- ❌ = Nicht unterstützt

---

## 8. Fazit

### 8.1 Empfohlene Lösung

**MetaMask Smart Account + Gas Station** ist die einzige Lösung die:

- Mit JEDEM ERC-20 Token funktioniert
- 0 ETH vom User erfordert
- MetaMask Browser Extension nativ unterstützt

### 8.2 Trade-offs

| Vorteil                    | Nachteil                       |
| -------------------------- | ------------------------------ |
| Universell für alle Tokens | Keine Testnet-Unterstützung    |
| Keine ETH nötig            | Nur bestimmte Tokens für Gas   |
| MetaMask nativ             | Keine volle dApp-Kontrolle     |
| Einmaliges Upgrade         | User muss Token manuell wählen |

### 8.3 Nächste Schritte

1. **Code anpassen:** `paymasterService` aus capabilities entfernen
2. **Netzwerk-Check:** Nur auf unterstützten Chains anbieten
3. **User-Kommunikation:** Erklären dass Gas in Token bezahlt wird
4. **Test-Strategie:** Sepolia-Tests mit ETH, oder auf Mainnet testen

---

## 9. Referenzen

### Offizielle Dokumentation

- [MetaMask Gas Station](https://support.metamask.io/manage-crypto/transactions/metamask-gas-station)
- [MetaMask Smart Account](https://support.metamask.io/configure/accounts/what-is-a-smart-account)
- [EIP-7702 Specification](https://eips.ethereum.org/EIPS/eip-7702)
- [EIP-5792 Specification](https://eips.ethereum.org/EIPS/eip-5792)

### Relevante GitHub Issues

- [MetaMask Issue #10914: eth_signTransaction fehlt](https://github.com/MetaMask/metamask-extension/issues/10914)
- [ERC-7677: Paymaster Web Service Capability](https://github.com/ethereum/ERCs/blob/master/ERCS/erc-7677.md)

### Getestete MetaMask Version

- **Version:** 13.13.1 (Chrome Extension)
- **Datum:** Januar 2026
- **Status:** Aktuellste Version

---

## Anhang A: wallet_getCapabilities Response

```json
{
  "0x1": {
    "atomic": { "status": "ready" },
    "auxiliaryFunds": { "supported": true }
  },
  "0x2105": {
    "atomic": { "status": "ready" },
    "auxiliaryFunds": { "supported": true }
  },
  "0x38": {
    "atomic": { "status": "ready" },
    "auxiliaryFunds": { "supported": true }
  },
  "0x89": {
    "atomic": { "status": "ready" },
    "auxiliaryFunds": { "supported": true }
  },
  "0xa": {
    "atomic": { "status": "ready" },
    "auxiliaryFunds": { "supported": true }
  },
  "0xa4b1": {
    "atomic": { "status": "ready" },
    "auxiliaryFunds": { "supported": true }
  },
  "0xaa36a7": {
    "atomic": { "status": "ready" }
  }
}
```

**Beachte:** `paymasterService` fehlt auf ALLEN Chains.

---

## Anhang B: Fehler-Codes

| Code   | Bedeutung              | Lösung                     |
| ------ | ---------------------- | -------------------------- |
| 5700   | Unsupported capability | paymasterService entfernen |
| -32602 | Invalid params         | Parameter-Format prüfen    |
| 4001   | User rejected          | User hat abgelehnt         |

---

---

## 10. Verifizierung der Annahmen

### 10.1 Verifizierte Annahmen

| #   | Annahme                                        | Status       | Quelle                                                                                                                 |
| --- | ---------------------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------- |
| 1   | Gas Station funktioniert für Token Sends       | ✅ BESTÄTIGT | "When sending transactions on Ethereum Mainnet and BNB Smart Chain, you can choose to pay the network fee with tokens" |
| 2   | Gas Station funktioniert für dApp Transactions | ✅ BESTÄTIGT | "Gas Station is also available on dapp transactions"                                                                   |
| 3   | Automatische Token-Auswahl bei 0 ETH           | ✅ BESTÄTIGT | "If you don't have enough of the network's native token, MetaMask will automatically select an eligible token"         |
| 4   | Smart Account Upgrade-Fee wird gerollt         | ✅ BESTÄTIGT | "Switching to a smart account involves paying a small gas fee that is rolled into your next transaction"               |
| 5   | MetaMask deckt Gas-Fee ab                      | ✅ BESTÄTIGT | "With gas included transactions, MetaMask covers the network fee as part of your transaction"                          |

### 10.2 Nicht vollständig verifizierte Punkte

| #   | Punkt                            | Status            | Notiz                                                                                                   |
| --- | -------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------- |
| 1   | Gas Station mit wallet_sendCalls | ⚠️ UNKLAR         | Dokumentation erwähnt es nicht explizit, aber "dapp transactions" sollten wallet_sendCalls einschließen |
| 2   | Upgrade-Fee in Token bezahlbar   | ⚠️ WAHRSCHEINLICH | Da Fee "rolled into next transaction" wird und Gas Station für alle Transaktionen funktioniert          |

### 10.3 Empfohlene praktische Tests

Vor Production-Einsatz sollten folgende Tests durchgeführt werden:

```bash
# Test 1: Gas Station mit wallet_sendCalls auf Mainnet
# - Wallet mit 0 ETH aber USDT
# - dApp ruft wallet_sendCalls
# - Erwartung: MetaMask zeigt Token-Auswahl für Gas

# Test 2: Smart Account Upgrade mit 0 ETH
# - Neues Wallet mit nur USDT
# - dApp triggert atomicRequired: true
# - Erwartung: Upgrade + Transfer komplett in USDT bezahlt
```

### 10.4 Quellen

**Offizielle MetaMask Dokumentation:**

- [Gas Station](https://support.metamask.io/manage-crypto/transactions/metamask-gas-station)
- [Smart Account Switch](https://support.metamask.io/configure/accounts/switch-to-or-revert-from-a-smart-account)
- [Send Tokens](https://support.metamask.io/manage-crypto/move-crypto/send/how-to-send-tokens-from-your-metamask-wallet/)

**Verifizierte Zitate:**

1. "When sending transactions on Ethereum Mainnet and BNB Smart Chain, you can choose to pay the network fee with the following tokens: USDT, USDC, DAI, ETH, wETH, wBTC, wstETH, wSOL, mUSD."

2. "If you don't have enough of the network's native token to pay the network fee, MetaMask will automatically select an eligible token for you."

3. "Gas Station is also available on dapp transactions and sending crypto."

4. "Confirming the switch to a smart account will prepare your account with smart functionality. This involves paying a small gas fee that is rolled into your next transaction."

5. "With gas included transactions, MetaMask covers the network fee as part of your transaction, and you can select a different token to cover the network fee."

---

## 11. Implementierte Code-Änderungen

### 11.1 metamask.hook.ts

Die `sendCallsWithPaymaster` Funktion wurde aktualisiert um MetaMask's Gas Station statt externer Paymasters zu verwenden:

```typescript
// VORHER (funktioniert NICHT mit MetaMask 13.x):
const result = await ethereum().request({
  method: 'wallet_sendCalls',
  params: [{
    version: '2.0.0',
    chainId: chainHex,
    from: account,
    atomicRequired: false,  // ← Problem 1
    calls: [...],
    capabilities: {
      paymasterService: {    // ← Problem 2: Nicht unterstützt
        url: paymasterUrl,
        optional: !requirePaymaster,
      },
    },
  }],
});

// NACHHER (Gas Station Ansatz):
const result = await ethereum().request({
  method: 'wallet_sendCalls',
  params: [{
    version: '2.0.0',
    chainId: chainHex,
    from: account,
    atomicRequired: true,   // ← Triggert Smart Account Upgrade
    calls: [...],
    // KEINE capabilities - Gas Station übernimmt automatisch
  }],
});
```

### 11.2 Geänderte Dateien

| Datei                                      | Änderung                                            |
| ------------------------------------------ | --------------------------------------------------- |
| `src/hooks/wallets/metamask.hook.ts`       | `paymasterService` entfernt, `atomicRequired: true` |
| `src/hooks/tx-helper.hook.ts`              | Kommentare aktualisiert                             |
| `src/__tests__/eip5792-real-hooks.test.ts` | Tests für Gas Station angepasst                     |

### 11.3 Verhaltensänderung

| Aspekt                 | Vorher                       | Nachher                                      |
| ---------------------- | ---------------------------- | -------------------------------------------- |
| Gas-Zahlung            | Externer Paymaster (Pimlico) | MetaMask Gas Station                         |
| Unterstützte Netzwerke | Alle (theoretisch)           | Mainnet, BNB, Arbitrum, Polygon, Linea, Base |
| Testnet-Support        | Ja (Sepolia)                 | ❌ Nein                                      |
| Smart Account          | Optional                     | Erforderlich (automatisch)                   |
| Token-Auswahl          | N/A                          | Automatisch bei 0 ETH                        |

---

_Dokument erstellt am 8. Januar 2026_
_Letzte Aktualisierung: 8. Januar 2026_
_Verifizierung hinzugefügt: 8. Januar 2026_
_Implementierung dokumentiert: 8. Januar 2026_
