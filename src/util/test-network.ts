// Hosts whose DFX API runs outside production. Only there may the app offer the STG/DEV
// simulations (simulated bank payment, simulated payout). The API rejects them on PRD as well;
// this gate only keeps the buttons off the production app.
const TEST_NETWORK_HOSTS = ['localhost', '127.0.0.1', 'dev.app.dfx.swiss', 'stg.app.dfx.swiss'];

export function isTestNetworkHost(hostname: string): boolean {
  return TEST_NETWORK_HOSTS.includes(hostname);
}

export function isTestNetwork(): boolean {
  return isTestNetworkHost(window.location.hostname);
}
