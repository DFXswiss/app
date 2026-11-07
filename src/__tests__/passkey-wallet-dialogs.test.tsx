import { fireEvent, render, screen } from '@testing-library/react';
import PasskeyRevokeSheet from '../components/home/wallet/passkey-revoke-sheet';
import PasskeySettingsSheet from '../components/home/wallet/passkey-settings-sheet';
import PasskeyWordsSheet from '../components/home/wallet/passkey-words-sheet';

const mockChangeLanguage = jest.fn();
const mockLanguages = [
  { id: 1, symbol: 'EN' },
  { id: 2, symbol: 'DE' },
];
jest.mock('../contexts/settings.context', () => ({
  useSettingsContext: () => ({
    translate: (_namespace: string, text: string) => text,
    language: mockLanguages[0],
    availableLanguages: mockLanguages,
    changeLanguage: mockChangeLanguage,
  }),
}));

describe('Passkey wallet dialogs', () => {
  it('shows recovery words, requires confirmation and forwards actions', () => {
    const onDone = jest.fn();
    const onAcknowledged = jest.fn();
    const onClose = jest.fn();
    const props = { words: ['one', 'two'], acknowledged: false, busy: false, onAcknowledged, onDone, onClose };
    const view = render(<PasskeyWordsSheet {...props} />);
    expect(screen.getByTestId('passkey-recovery-words')).toHaveTextContent('one');
    expect(screen.getByRole('button', { name: 'Done' })).toBeDisabled();
    fireEvent.click(screen.getByLabelText('I have written the words down on paper.'));
    expect(onAcknowledged).toHaveBeenCalledWith(true);
    view.rerender(<PasskeyWordsSheet {...props} acknowledged note="export failed" />);
    expect(screen.getByRole('alert')).toHaveTextContent('export failed');
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onDone).toHaveBeenCalledTimes(1);
    view.rerender(<PasskeyWordsSheet {...props} words={undefined} acknowledged />);
    expect(screen.getByRole('button', { name: 'Done' })).toBeDisabled();
    view.rerender(<PasskeyWordsSheet {...props} acknowledged busy />);
    expect(screen.getByRole('button', { name: 'Done' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Close' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).not.toHaveBeenCalled();
    view.rerender(<PasskeyWordsSheet {...props} acknowledged />);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('displays revocation choices, backup warning and the active-wallet result', () => {
    const onBackup = jest.fn(),
      onReason = jest.fn(),
      onMethod = jest.fn(),
      onAcknowledged = jest.fn();
    const onRevoke = jest.fn(),
      onClose = jest.fn();
    const props = {
      backupNeeded: true,
      canBackUp: true,
      acknowledged: false,
      busy: false,
      reason: 'Lost' as const,
      method: 'passkey' as const,
      onBackup,
      onReason,
      onMethod,
      onAcknowledged,
      onRevoke,
      onClose,
    };
    const view = render(<PasskeyRevokeSheet {...props} />);
    expect(screen.getByRole('button', { name: 'Block', exact: true })).toBeDisabled();
    view.rerender(<PasskeyRevokeSheet {...props} canBackUp={false} />);
    expect(screen.getByRole('button', { name: 'Back up first' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Back up first' }));
    expect(onBackup).not.toHaveBeenCalled();
    view.rerender(<PasskeyRevokeSheet {...props} />);
    expect(screen.getByRole('button', { name: 'Back up first' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Back up first' }));
    fireEvent.click(screen.getByLabelText('Passkey compromised'));
    fireEvent.click(screen.getByLabelText('New login'));
    fireEvent.click(screen.getByLabelText('I understand that this cannot be undone.'));
    expect(onBackup).toHaveBeenCalledTimes(1);
    expect(onReason).toHaveBeenCalledWith('Compromised');
    expect(onMethod).toHaveBeenCalledWith('login');
    expect(onAcknowledged).toHaveBeenCalledWith(true);
    view.rerender(<PasskeyRevokeSheet {...props} acknowledged note="Wallet status is Active." />);
    expect(screen.getByText('Not blocked yet')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Block', exact: true }));
    expect(onRevoke).toHaveBeenCalledTimes(1);
    view.rerender(<PasskeyRevokeSheet {...props} method="login" />);
    expect(
      screen.getByText('Uses your current DFX login. If you are not signed in, sign in by e-mail or wallet first.'),
    ).toBeInTheDocument();
    view.rerender(<PasskeyRevokeSheet {...props} backupNeeded={false} acknowledged busy note="failure" />);
    expect(screen.getByRole('alert')).toHaveTextContent('failure');
    expect(screen.queryByRole('button', { name: 'Back up first' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Block', exact: true })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Close' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).not.toHaveBeenCalled();
    view.rerender(<PasskeyRevokeSheet {...props} acknowledged />);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('exposes settings actions and language selection', () => {
    const onWords = jest.fn(),
      onLink = jest.fn(),
      onVerify = jest.fn(),
      onRefresh = jest.fn();
    const onStatus = jest.fn(),
      onDiagnostics = jest.fn(),
      onAnotherPasskey = jest.fn(),
      onRevoke = jest.fn();
    const onCancel = jest.fn(),
      onClose = jest.fn(),
      onEvmIndex = jest.fn();
    const props = {
      unlocked: true,
      canUnlock: false,
      backupNeeded: true,
      credentialId: 'credential',
      busy: false,
      evmIndex: '1',
      validEvmIndex: true,
      onWords,
      onLink,
      onVerify,
      onRefresh,
      onStatus,
      onDiagnostics,
      onAnotherPasskey,
      onRevoke,
      onCancel,
      onClose,
      onEvmIndex,
    };
    const view = render(<PasskeySettingsSheet {...props} />);
    expect(screen.getByRole('button', { name: /Recovery words/ })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: /Recovery words/ }));
    fireEvent.change(screen.getByLabelText(/Another EVM account/), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Link' }));
    fireEvent.click(screen.getByRole('button', { name: /Check addresses/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Reload data' }));
    fireEvent.click(screen.getByRole('button', { name: 'Check passkey status' }));
    fireEvent.click(screen.getByRole('button', { name: 'Send diagnostics to support' }));
    fireEvent.click(screen.getByRole('button', { name: 'Use another passkey' }));
    fireEvent.click(screen.getByRole('button', { name: 'Block passkey' }));
    fireEvent.change(screen.getByLabelText(/Language/), { target: { value: 'DE' } });
    expect(mockChangeLanguage).toHaveBeenCalledWith(mockLanguages[1]);
    fireEvent.change(screen.getByLabelText(/Language/), { target: { value: 'XX' } });
    expect(mockChangeLanguage).toHaveBeenCalledTimes(1);
    expect(onEvmIndex).toHaveBeenCalledWith('2');
    [onWords, onLink, onVerify, onRefresh, onStatus, onDiagnostics, onAnotherPasskey, onRevoke].forEach((fn) =>
      expect(fn).toHaveBeenCalledTimes(1),
    );
    fireEvent.click(screen.getAllByRole('button', { name: 'Close' })[1]);
    expect(onCancel).toHaveBeenCalledTimes(1);
    view.rerender(
      <PasskeySettingsSheet
        {...props}
        unlocked={false}
        backupNeeded={false}
        backupSeenDate="2026-11-06"
        credentialId=""
        note="failure"
        checks={[{ family: 'Evm', address: 'a', matches: false }]}
      />,
    );
    expect(screen.getByText('Backed up on 2026-11-06')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('failure');
    expect(screen.getByText('0 / 1 addresses match')).toBeInTheDocument();
    view.rerender(<PasskeySettingsSheet {...props} checks={[]} />);
    expect(screen.getByText('0 / 0 addresses match')).not.toHaveClass('text-dfxGreen-300');
    expect(screen.getByText('0 / 0 addresses match')).not.toHaveClass('text-dfxRed-150');
    view.rerender(<PasskeySettingsSheet {...props} checks={[{ family: 'Evm', address: 'a', matches: true }]} />);
    expect(screen.getByText('1 / 1 addresses match')).toHaveClass('text-dfxGreen-300');
    view.rerender(
      <PasskeySettingsSheet
        {...props}
        unlocked={false}
        backupNeeded={false}
        backupSeenDate="2026-11-06"
        credentialId=""
        note="failure"
        checks={[{ family: 'Evm', address: 'a', matches: false }]}
      />,
    );
    expect(screen.getByRole('button', { name: 'Link' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Check passkey status' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Recovery words/ })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /Recovery words/ }));
    expect(onWords).toHaveBeenCalledTimes(1);
    view.rerender(<PasskeySettingsSheet {...props} unlocked={false} canUnlock />);
    expect(screen.getByRole('button', { name: /Recovery words/ })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: /Recovery words/ }));
    expect(onWords).toHaveBeenCalledTimes(2);
    view.rerender(<PasskeySettingsSheet {...props} note="Wallets on this account: 1." />);
    expect(screen.getByRole('button', { name: 'Reload data' })).toHaveTextContent('Wallets on this account: 1.');
    view.rerender(<PasskeySettingsSheet {...props} note="credential: Active" />);
    expect(screen.getByRole('button', { name: 'Check passkey status' })).toHaveTextContent('credential: Active');
    view.rerender(<PasskeySettingsSheet {...props} note="Sent. Thank you!" />);
    expect(screen.getByRole('button', { name: 'Send diagnostics to support' })).toHaveTextContent('Sent. Thank you!');
    view.rerender(<PasskeySettingsSheet {...props} note="Linked Evm 0x1111111111111111111111111111111111111111." />);
    expect(screen.getByRole('status')).toHaveTextContent('Linked Evm');
    view.rerender(<PasskeySettingsSheet {...props} validEvmIndex={false} busy />);
    expect(screen.getByRole('button', { name: 'Link' })).toBeDisabled();
  });
});
