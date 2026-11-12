import { fireEvent, render, screen } from '@testing-library/react';
import PasskeyRevokeSheet from '../components/home/wallet/passkey-revoke-sheet';
import PasskeySettingsSheet from '../components/home/wallet/passkey-settings-sheet';
import PasskeyWordsSheet from '../components/home/wallet/passkey-words-sheet';

let mockTranslateAddresses = false;
jest.mock('../contexts/settings.context', () => ({
  useSettingsContext: () => ({
    translate: (_namespace: string, text: string) =>
      mockTranslateAddresses && ['Bitcoin', 'Lightning (Spark)', 'Ethereum & EVM'].includes(text)
        ? `translated ${text}`
        : text,
  }),
}));

describe('Passkey wallet dialogs', () => {
  it('scrolls a new or changed revocation note into view', () => {
    const original = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollIntoView');
    const scrollIntoView = jest.fn();
    Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: scrollIntoView });
    const props = {
      acknowledged: false,
      busy: false,
      reason: 'Lost' as const,
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

  it('shows the recovery phrase and derivation paths, and forwards actions', () => {
    const onDone = jest.fn();
    const onClose = jest.fn();
    const paths = { evm: "m/44'/60'/0'/0/0", bitcoin: "m/84'/0'/0'", spark: "m/8797555'/1'/0'" };
    const props = { words: ['one', 'two'], busy: false, paths, onDone, onClose };
    const view = render(<PasskeyWordsSheet {...props} />);
    expect(screen.getByRole('heading', { name: 'Export recovery phrase' })).toBeInTheDocument();
    expect(screen.getByTestId('passkey-recovery-words')).toHaveTextContent('one');
    expect(screen.getByText('Derivation version v1')).toBeInTheDocument();
    expect(screen.getByText("m/44'/60'/0'/0/0")).toBeInTheDocument();
    expect(screen.getByText("m/84'/0'/0'")).toBeInTheDocument();
    expect(screen.getByText("m/8797555'/1'/0'")).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Done' })).toBeEnabled();
    view.rerender(<PasskeyWordsSheet {...props} note="export failed" />);
    expect(screen.getByRole('alert')).toHaveTextContent('export failed');
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onDone).toHaveBeenCalledTimes(1);
    view.rerender(<PasskeyWordsSheet {...props} words={undefined} />);
    expect(screen.queryByText('Derivation version v1')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Done' })).toBeDisabled();
    view.rerender(<PasskeyWordsSheet {...props} busy />);
    expect(screen.getByRole('button', { name: 'Done' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Close' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).not.toHaveBeenCalled();
    view.rerender(<PasskeyWordsSheet {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('displays revocation choices', () => {
    const onReason = jest.fn(),
      onAcknowledged = jest.fn();
    const onRevoke = jest.fn(),
      onClose = jest.fn();
    const props = {
      acknowledged: false,
      busy: false,
      reason: 'Lost' as const,
      onReason,
      onAcknowledged,
      onRevoke,
      onClose,
    };
    const view = render(<PasskeyRevokeSheet {...props} />);
    expect(screen.getByText('You confirm one last time with this passkey.')).toBeInTheDocument();
    expect(screen.getByText('Device gone, deleted or no longer accessible')).toBeInTheDocument();
    expect(screen.getByText('Someone else may have access to the passkey or the recovery phrase')).toBeInTheDocument();
    expect(
      screen.queryByText('Someone else may have access. Move your funds to a safe address with “Send” first.'),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Confirm with')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Block', exact: true })).toBeDisabled();
    fireEvent.click(screen.getByLabelText('Passkey compromised'));
    expect(screen.queryByText('New login')).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByLabelText('I understand that this page can no longer open the wallet with this passkey.'),
    );
    expect(onReason).toHaveBeenCalledWith('Compromised');
    expect(onAcknowledged).toHaveBeenCalledWith(true);
    view.rerender(<PasskeyRevokeSheet {...props} acknowledged />);
    fireEvent.click(screen.getByRole('button', { name: 'Block', exact: true }));
    expect(onRevoke).toHaveBeenCalledTimes(1);
    view.rerender(<PasskeyRevokeSheet {...props} acknowledged busy note="failure" />);
    expect(screen.getByRole('alert')).toHaveTextContent('failure');
    expect(screen.getByRole('alert')).toHaveClass('text-dfxRed-150');
    expect(screen.getByRole('button', { name: 'Block', exact: true })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Close' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).not.toHaveBeenCalled();
    view.rerender(<PasskeyRevokeSheet {...props} acknowledged />);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('exposes the remaining settings actions', () => {
    const onWords = jest.fn(),
      onVerify = jest.fn(),
      onRefresh = jest.fn();
    const onStatus = jest.fn(),
      onDiagnostics = jest.fn(),
      onAnotherPasskey = jest.fn(),
      onRevoke = jest.fn();
    const onCancel = jest.fn(),
      onClose = jest.fn();
    const props = {
      credentialId: 'credential',
      busy: false,
      onWords,
      onVerify,
      onRefresh,
      onStatus,
      onDiagnostics,
      onAnotherPasskey,
      onRevoke,
      onCancel,
      onClose,
    };
    const view = render(<PasskeySettingsSheet {...props} />);
    expect(screen.getByText('Unlocked')).toBeInTheDocument();
    expect(screen.queryByText('In case the passkey is gone')).not.toBeInTheDocument();
    expect(screen.queryByText('Storage')).not.toBeInTheDocument();
    expect(
      screen.queryByText('Only on this device. If it is lost, you need your recovery words.'),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Checks that DFX shows your own addresses')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export recovery phrase' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Export recovery phrase' }));
    fireEvent.click(screen.getByRole('button', { name: /Check addresses/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Reload data' }));
    fireEvent.click(screen.getByRole('button', { name: 'Check passkey status' }));
    fireEvent.click(screen.getByRole('button', { name: 'Record a diagnostic' }));
    fireEvent.click(screen.getByRole('button', { name: 'Use another passkey' }));
    fireEvent.click(screen.getByRole('button', { name: 'Block passkey' }));
    [onWords, onVerify, onRefresh, onStatus, onDiagnostics, onAnotherPasskey, onRevoke].forEach((fn) =>
      expect(fn).toHaveBeenCalledTimes(1),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Back to DFX' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();

    view.rerender(
      <PasskeySettingsSheet
        {...props}
        credentialId=""
        note="failure"
        checks={[{ family: 'Evm', address: 'a', matches: false }]}
      />,
    );
    expect(screen.getByText('Unlocked')).toBeInTheDocument();
    expect(screen.queryByText('Unlock to view')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('failure');
    expect(screen.getByText('0 / 1 addresses match')).toHaveClass('text-dfxRed-150');
    expect(screen.getByRole('button', { name: 'Check passkey status' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Check addresses/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Export recovery phrase' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Export recovery phrase' }));
    expect(onWords).toHaveBeenCalledTimes(2);

    view.rerender(<PasskeySettingsSheet {...props} checks={[]} />);
    expect(screen.getByText('0 / 0 addresses match')).not.toHaveClass('text-dfxGreen-300');
    expect(screen.getByText('0 / 0 addresses match')).not.toHaveClass('text-dfxRed-150');
    view.rerender(<PasskeySettingsSheet {...props} checks={[{ family: 'Evm', address: 'a', matches: true }]} />);
    expect(screen.getByText('1 / 1 addresses match')).toHaveClass('text-dfxGreen-300');

    mockTranslateAddresses = true;
    try {
      view.rerender(
        <PasskeySettingsSheet
          {...props}
          checks={[
            { family: 'Evm', address: 'a', matches: true },
            { family: 'Spark', address: 'b', matches: true },
            { family: 'Bitcoin', address: 'c', matches: true },
          ]}
        />,
      );
      expect(screen.getByText(/translated Ethereum & EVM/)).toBeInTheDocument();
      expect(screen.getByText(/translated Lightning \(Spark\)/)).toBeInTheDocument();
      expect(screen.getByText(/translated Bitcoin/)).toBeInTheDocument();
    } finally {
      mockTranslateAddresses = false;
    }

    view.rerender(<PasskeySettingsSheet {...props} noteKind="refresh" note="Konten: 1" />);
    expect(screen.getByRole('button', { name: 'Reload data' })).toHaveTextContent('Konten: 1');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    view.rerender(<PasskeySettingsSheet {...props} noteKind="status" note="credential: Aktiv" />);
    expect(screen.getByRole('button', { name: 'Check passkey status' })).toHaveTextContent('credential: Aktiv');
    expect(screen.getByText('credential: Aktiv')).toHaveClass('text-dfxRed-150');
    expect(screen.getByText('credential: Aktiv')).not.toHaveClass('text-dfxGreen-300');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    view.rerender(<PasskeySettingsSheet {...props} noteKind="status" note="credential: Active" statusOk />);
    expect(screen.getByText('credential: Active')).toHaveClass('text-dfxGreen-300');
    expect(screen.getByText('credential: Active')).not.toHaveClass('text-dfxRed-150');
    view.rerender(
      <PasskeySettingsSheet {...props} noteKind="status" note="credential: Compromised" statusOk={false} />,
    );
    expect(screen.getByText('credential: Compromised')).toHaveClass('text-dfxRed-150');
    expect(screen.getByText('credential: Compromised')).not.toHaveClass('text-dfxGreen-300');
    view.rerender(<PasskeySettingsSheet {...props} noteKind="diagnostics" note="ignored" />);
    expect(screen.getByRole('button', { name: 'Record a diagnostic' })).toHaveTextContent('Diagnostic recorded.');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    view.rerender(<PasskeySettingsSheet {...props} busy />);
    expect(screen.getByRole('button', { name: 'Export recovery phrase' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Check addresses/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Reload data' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Back to DFX' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Close' })).toBeDisabled();
  });
});
