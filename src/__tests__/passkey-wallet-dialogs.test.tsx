import { fireEvent, render, screen } from '@testing-library/react';
import PasskeyRevokeSheet from '../components/home/wallet/passkey-revoke-sheet';
import PasskeySettingsSheet from '../components/home/wallet/passkey-settings-sheet';
import PasskeyWordsSheet from '../components/home/wallet/passkey-words-sheet';

const mockChangeLanguage = jest.fn();
const mockChangeAppLanguage = jest.fn();
const mockLanguages = [
  { id: 1, symbol: 'EN' },
  { id: 2, symbol: 'DE' },
];
jest.mock('../contexts/settings.context', () => ({
  useSettingsContext: () => ({
    translate: (_namespace: string, text: string) => text,
    locale: 'de-DE',
    language: mockLanguages[0],
    availableLanguages: mockLanguages,
    changeLanguage: mockChangeLanguage,
    changeAppLanguage: mockChangeAppLanguage,
  }),
}));

describe('Passkey wallet dialogs', () => {
  it('scrolls a new or changed revocation note into view', () => {
    const original = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollIntoView');
    const scrollIntoView = jest.fn();
    Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: scrollIntoView });
    const props = {
      backupNeeded: true,
      canBackUp: true,
      acknowledged: false,
      busy: false,
      reason: 'Lost' as const,
      onBackup: jest.fn(),
      onReason: jest.fn(),
      onAcknowledged: jest.fn(),
      onRevoke: jest.fn(),
      onClose: jest.fn(),
    };
    try {
      const view = render(<PasskeyRevokeSheet {...props} />);
      expect(scrollIntoView).not.toHaveBeenCalled();
      view.rerender(<PasskeyRevokeSheet {...props} note="first" />);
      expect(scrollIntoView).toHaveBeenCalledTimes(1);
      expect(scrollIntoView).toHaveBeenLastCalledWith({ block: 'nearest' });
      expect(screen.getByRole('alert')).toHaveClass('scroll-mt-[68px]');
      view.rerender(<PasskeyRevokeSheet {...props} note="first" />);
      expect(scrollIntoView).toHaveBeenCalledTimes(1);
      view.rerender(<PasskeyRevokeSheet {...props} note="second" />);
      expect(scrollIntoView).toHaveBeenCalledTimes(2);
      view.rerender(<PasskeyRevokeSheet {...props} />);
      expect(scrollIntoView).toHaveBeenCalledTimes(2);
    } finally {
      if (original) Object.defineProperty(Element.prototype, 'scrollIntoView', original);
      else Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
    }
  });

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

  it('displays revocation choices and the backup warning', () => {
    const onBackup = jest.fn(),
      onReason = jest.fn(),
      onAcknowledged = jest.fn();
    const onRevoke = jest.fn(),
      onClose = jest.fn();
    const props = {
      backupNeeded: true,
      canBackUp: true,
      acknowledged: false,
      busy: false,
      reason: 'Lost' as const,
      onBackup,
      onReason,
      onAcknowledged,
      onRevoke,
      onClose,
    };
    const view = render(<PasskeyRevokeSheet {...props} />);
    expect(screen.getByText('You confirm one last time with this passkey.')).toBeInTheDocument();
    expect(screen.queryByText('Confirm with')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Block', exact: true })).toBeDisabled();
    view.rerender(<PasskeyRevokeSheet {...props} canBackUp={false} />);
    expect(screen.getByRole('button', { name: 'Back up first' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Back up first' }));
    expect(onBackup).not.toHaveBeenCalled();
    view.rerender(<PasskeyRevokeSheet {...props} />);
    expect(screen.getByRole('button', { name: 'Back up first' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Back up first' }));
    fireEvent.click(screen.getByLabelText('Passkey compromised'));
    expect(screen.queryByText('New login')).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('I understand that this cannot be undone.'));
    expect(onBackup).toHaveBeenCalledTimes(1);
    expect(onReason).toHaveBeenCalledWith('Compromised');
    expect(onAcknowledged).toHaveBeenCalledWith(true);
    view.rerender(<PasskeyRevokeSheet {...props} acknowledged />);
    fireEvent.click(screen.getByRole('button', { name: 'Block', exact: true }));
    expect(onRevoke).toHaveBeenCalledTimes(1);
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
    fireEvent.click(screen.getByRole('button', { name: 'Record a diagnostic' }));
    fireEvent.click(screen.getByRole('button', { name: 'Use another passkey' }));
    fireEvent.click(screen.getByRole('button', { name: 'Block passkey' }));
    fireEvent.change(screen.getByLabelText(/Language/), { target: { value: 'DE' } });
    expect(mockChangeAppLanguage).toHaveBeenCalledWith(mockLanguages[1]);
    expect(mockChangeLanguage).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/Language/), { target: { value: 'XX' } });
    expect(mockChangeAppLanguage).toHaveBeenCalledTimes(1);
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
        backupSeenDate="2026-11-06T10:00:00.000Z"
        credentialId=""
        note="failure"
        checks={[{ family: 'Evm', address: 'a', matches: false }]}
      />,
    );
    expect(screen.getByText('Backed up on 06.11.2026')).toBeInTheDocument();
    view.rerender(<PasskeySettingsSheet {...props} backupNeeded={false} backupSeenDate="invalid-date" />);
    expect(screen.getByText('Backed up on invalid-date')).toBeInTheDocument();
    view.rerender(
      <PasskeySettingsSheet
        {...props}
        unlocked={false}
        backupNeeded={false}
        backupSeenDate="2026-11-06T10:00:00.000Z"
        credentialId=""
        note="failure"
        checks={[{ family: 'Evm', address: 'a', matches: false }]}
      />,
    );
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
    view.rerender(<PasskeySettingsSheet {...props} noteKind="refresh" note="Konten: 1" />);
    expect(screen.getByRole('button', { name: 'Reload data' })).toHaveTextContent('Konten: 1');
    view.rerender(<PasskeySettingsSheet {...props} noteKind="status" note="credential: Aktiv" />);
    expect(screen.getByRole('button', { name: 'Check passkey status' })).toHaveTextContent('credential: Aktiv');
    view.rerender(<PasskeySettingsSheet {...props} noteKind="diagnostics" note="Diagnostic recorded." />);
    expect(screen.getByRole('button', { name: 'Record a diagnostic' })).toHaveTextContent('Diagnostic recorded.');
    view.rerender(<PasskeySettingsSheet {...props} noteKind="link" note="Verknüpft 0x123" />);
    expect(screen.getByRole('status')).toHaveTextContent('Verknüpft 0x123');
    view.rerender(<PasskeySettingsSheet {...props} validEvmIndex={false} busy />);
    expect(screen.getByRole('button', { name: 'Link' })).toBeDisabled();
  });
});
