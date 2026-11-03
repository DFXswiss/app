import { checkPasskeyPlatform, RP_IDS, type PlatformReport, type WalletEnv } from '@dfx.swiss/wallet';
import { StyledButton, StyledButtonColor, StyledButtonWidth, StyledVerticalStack } from '@dfx.swiss/react-components';
import { useEffect, useState } from 'react';
import { useSettingsContext } from '../../../contexts/settings.context';
import { ConnectProps } from '../connect-shared';

// Host of this page, mapped onto the wallet package's relying-party environments. Any other host is
// checked as production and comes back unavailable when it is not the production relying party.
export function walletEnvForHost(hostname: string): WalletEnv {
  if (hostname === RP_IDS.loc || hostname === '127.0.0.1') return 'loc';
  if (hostname === RP_IDS.dev) return 'dev';
  return 'prd';
}

const PLATFORM_BLOCK: Record<NonNullable<PlatformReport['reason']>, string> = {
  'no-webauthn': 'This browser has no passkey support',
  'no-prf': 'This browser has no passkey PRF extension',
  'in-app-browser': 'Passkeys do not run inside this in-app browser',
  embedded: 'Passkeys do not run in an embedded frame',
  'wrong-origin': 'Passkeys are not available on this host',
  'os-too-old': 'This operating system is too old for passkeys',
};

// The login ceremony stays disabled. The platform report only explains why this browser cannot use it.
export function passkeyPlatformBlock(report: PlatformReport | undefined): string | undefined {
  if (!report || report.available || !report.reason) return undefined;
  return PLATFORM_BLOCK[report.reason];
}

// The passkey login tile stays a placeholder behind ?feature=Passkey. @dfx.swiss/wallet checks the
// platform; the ceremony (PRF seed derivation, seed proofs, backup screen) is not started here.
export default function ConnectPasskey(props: ConnectProps): JSX.Element {
  const { onCancel }: ConnectProps = props;
  const { translate } = useSettingsContext();
  const [report, setReport] = useState<PlatformReport | undefined>();

  useEffect(() => {
    let cancelled = false;
    void checkPasskeyPlatform(walletEnvForHost(window.location.hostname)).then((next) => {
      if (!cancelled) setReport(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const block = passkeyPlatformBlock(report);

  return (
    <StyledVerticalStack gap={2} center>
      <p className="text-dfxGray-700">{translate('screens/home', 'Passkey login arrives with the wallet beta')}</p>
      {block ? <p className="text-dfxGray-700">{translate('screens/home', block)}</p> : null}

      <StyledButton
        width={StyledButtonWidth.FULL}
        color={StyledButtonColor.GRAY}
        label={translate('screens/home', 'Passkey')}
        onClick={() => undefined}
        disabled
      />
      <StyledButton
        width={StyledButtonWidth.FULL}
        color={StyledButtonColor.RED}
        label={translate('general/actions', 'Close')}
        onClick={onCancel}
      />
    </StyledVerticalStack>
  );
}
