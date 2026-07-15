import { fireEvent, render, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { Sheet } from '../components/ui';

function ModalHarness() {
  const [open, setOpen] = useState(false);
  return (
    <div className="app">
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
