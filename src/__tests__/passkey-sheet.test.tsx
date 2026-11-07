import { fireEvent, render, screen } from '@testing-library/react';
import PasskeySheet from '../components/home/wallet/passkey-sheet';

jest.mock('../contexts/settings.context', () => ({
  useSettingsContext: () => ({ translate: (_: string, text: string) => text }),
}));

describe('PasskeySheet', () => {
  it('focuses the dialog, traps Tab and restores focus after close', () => {
    const previous = document.createElement('button');
    document.body.appendChild(previous);
    previous.focus();
    const onClose = jest.fn();
    const { unmount } = render(
      <PasskeySheet title="Settings" onClose={onClose}>
        <button>First</button>
        <button>Last</button>
      </PasskeySheet>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Settings' });
    const close = screen.getByRole('button', { name: 'Close' });
    const last = screen.getByRole('button', { name: 'Last' });
    expect(dialog).toHaveFocus();
    screen.getByRole('button', { name: 'First' }).focus();
    const middleTab = new KeyboardEvent('keydown', { key: 'Tab', cancelable: true });
    document.dispatchEvent(middleTab);
    expect(middleTab.defaultPrevented).toBe(false);
    dialog.focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(last).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(close).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    unmount();
    expect(previous).toHaveFocus();
    previous.remove();
  });

  it('closes on backdrop and close button, but not on the dialog', () => {
    const onClose = jest.fn();
    render(
      <PasskeySheet title="Receive" onClose={onClose}>
        Content
      </PasskeySheet>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Receive' });
    fireEvent.mouseDown(dialog);
    expect(onClose).not.toHaveBeenCalled();
    if (!dialog.parentElement) throw new Error('Missing backdrop');
    fireEvent.mouseDown(dialog.parentElement);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('prevents Tab in a dialog without enabled controls', () => {
    render(<PasskeySheet title="Locked" onClose={() => undefined} />);
    screen.getByRole('button', { name: 'Close' }).setAttribute('disabled', '');
    const event = new KeyboardEvent('keydown', { key: 'Tab', cancelable: true });
    document.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it('closes safely when no element held focus before opening', () => {
    const active = jest.spyOn(document, 'activeElement', 'get').mockReturnValue(null);
    const { unmount } = render(<PasskeySheet title="Settings" onClose={() => undefined} />);
    active.mockRestore();
    expect(() => unmount()).not.toThrow();
  });
});
