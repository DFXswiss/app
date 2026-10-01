import { fireEvent, render, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { Sheet, ToastProvider, useToast } from '../components/ui';
import { cx } from '../css';

// Reality declaration: hashed CSS names and JSDOM inert properties model the modal boundary;
// these tests do not prove a browser accessibility tree or an actual spoken announcement.
jest.mock('../styles/base.module.css', () => ({
  __esModule: true,
  default: new Proxy({}, { get: (_target, name) => `h_${String(name)}` }),
}));

function ToastButtons() {
  const { showToast } = useToast();
  return (
    <>
      <button onClick={() => showToast('Saved')}>Notify</button>
      <button onClick={() => showToast('Try again', { assertive: true })}>Alert</button>
    </>
  );
}

function ModalHarness() {
  const [open, setOpen] = useState(false);
  return (
    <div className={cx('app')} data-app2-root>
      <button data-testid="opener" onClick={() => setOpen(true)}>
        Open
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} titleId="modal-title">
        <h2 id="modal-title">Dialog</h2>
        <button data-testid="first">First</button>
        <button data-testid="last">Last</button>
      </Sheet>
    </div>
  );
}

describe('App2 modal accessibility', () => {
  it('keeps both toast live regions outside the inert boundary of a nested hashed app modal', async () => {
    const { getByRole, getByTestId } = render(
      <ToastProvider>
        <div className={cx('app')} data-app2-root data-testid="app-root">
          <button data-testid="background">Background</button>
          <div>
            <button data-testid="nested-background">Nested background</button>
            <Sheet open onClose={jest.fn()} titleId="toast-title">
              <h2 id="toast-title">Notifications</h2>
              <ToastButtons />
            </Sheet>
          </div>
        </div>
      </ToastProvider>,
    );
    expect(getByTestId('app-root')).toHaveClass('h_app');
    await waitFor(() => expect(getByRole('button', { name: 'Notify' })).toHaveFocus());
    expect(getByTestId('background')).toHaveProperty('inert', true);
    expect(getByTestId('nested-background')).toHaveProperty('inert', true);
    fireEvent.click(getByRole('button', { name: 'Notify' }));
    fireEvent.click(getByRole('button', { name: 'Alert' }));
    expect(getByRole('status')).toHaveTextContent('Saved');
    expect(getByRole('alert')).toHaveTextContent('Try again');
    for (const role of ['status', 'alert']) {
      for (let node: HTMLElement | null = getByRole(role); node; node = node.parentElement) {
        expect(node.inert).not.toBe(true);
      }
    }
  });

  it('inerts the background, traps focus, closes on Escape and restores focus', async () => {
    const { getByTestId, getByRole } = render(<ModalHarness />);
    const opener = getByTestId('opener');
    const first = getByTestId('first');
    const last = getByTestId('last');

    opener.focus();
    fireEvent.click(opener);
    await waitFor(() => expect(first).toHaveFocus());
    expect(opener).toHaveProperty('inert', true);

    last.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(first).toHaveFocus();

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(getByRole('dialog', { hidden: true })).toHaveAttribute('aria-hidden', 'true'));
    expect(opener).toHaveFocus();
    expect(opener.inert).not.toBe(true);
  });
});
