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
    expect(
      screen.queryByText('Someone else may have access. Move your funds to a safe address with “Send” first.'),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Confirm with')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Block', exact: true })).toBeDisabled();
    fireEvent.click(screen.getByLabelText('Passkey compromised'));
    expect(screen.queryByText('New login')).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('I understand that this cannot be undone.'));
    expect(onReason).toHaveBeenCalledWith('Compromised');
    expect(onAcknowledged).toHaveBeenCalledWith(true);
    view.rerender(<PasskeyRevokeSheet {...props} acknowledged />);
    fireEvent.click(screen.getByRole('button', { name: 'Block', exact: true }));
    expect(onRevoke).toHaveBeenCalledTimes(1);
    view.rerender(<PasskeyRevokeSheet {...props} acknowledged busy note="failure" />);
    expect(screen.getByRole('alert')).toHaveTextContent('failure');
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
    expect(screen.getByRole('button', { name: /Recovery words/ })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: /Recovery words/ }));
    fireEvent.click(screen.getByRole('button', { name: /Check addresses/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Reload data' }));
    fireEvent.click(screen.getByRole('button', { name: 'Check passkey status' }));
    fireEvent.click(screen.getByRole('button', { name: 'Record a diagnostic' }));
    fireEvent.click(screen.getByRole('button', { name: 'Use another passkey' }));
    fireEvent.click(screen.getByRole('button', { name: 'Block passkey' }));
    [onWords, onVerify, onRefresh, onStatus, onDiagnostics, onAnotherPasskey, onRevoke].forEach((fn) =>
      expect(fn).toHaveBeenCalledTimes(1),
    );
    fireEvent.click(screen.getAllByRole('button', { name: 'Close' })[1]);
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
    expect(screen.getByRole('button', { name: /Recovery words/ })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: /Recovery words/ }));
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
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    view.rerender(<PasskeySettingsSheet {...props} noteKind="diagnostics" note="ignored" />);
    expect(screen.getByRole('button', { name: 'Record a diagnostic' })).toHaveTextContent('Diagnostic recorded.');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    view.rerender(<PasskeySettingsSheet {...props} busy />);
    expect(screen.getByRole('button', { name: /Recovery words/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Check addresses/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Reload data' })).toBeDisabled();
    screen.getAllByRole('button', { name: 'Close' }).forEach((button) => expect(button).toBeDisabled());
  });
});
