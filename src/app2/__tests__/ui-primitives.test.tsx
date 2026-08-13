import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useRef, useState } from 'react';
import {
  LoadingRow,
  ScreenPlaceholder,
  Sheet,
  SheetHeader,
  Spinner,
  ToastProvider,
  onActivate,
  useInertWhenClosed,
  useModalDialog,
  useToast,
} from '../components/ui';

function ToastButtons() {
  const { showToast } = useToast();
  return (
    <div>
      <button type="button" onClick={() => showToast('copied')}>
        polite
      </button>
      <button type="button" onClick={() => showToast('failed', { assertive: true })}>
        assertive
      </button>
    </div>
  );
}

function OutsideToast() {
  useToast();
  return null;
}

function InertProbe({ open }: { open: boolean }) {
  const attached = useInertWhenClosed<HTMLDivElement>(open);
  useInertWhenClosed<HTMLDivElement>(open);
  return <div ref={attached} data-testid="inert-target" />;
}

function ModalHarness({
  startOpen = false,
  withApp = true,
  withFocusable = true,
}: {
  startOpen?: boolean;
  withApp?: boolean;
  withFocusable?: boolean;
}) {
  const [open, setOpen] = useState(startOpen);
  const inner = (
    <>
      <button data-testid="opener" onClick={() => setOpen(true)}>
        Open
      </button>
      <span>plain text sibling</span>
      <Sheet open={open} onClose={() => setOpen(false)} titleId="ui-title" showGrab={false}>
        <h2 id="ui-title">Dialog</h2>
        {withFocusable ? (
          <>
            <button data-testid="first">First</button>
            <button data-testid="hidden" aria-hidden="true">
              Hidden
            </button>
            <button
              data-testid="inerted"
              ref={(el) => {
                if (el) el.inert = true;
              }}
            >
              Inert
            </button>
            <button data-testid="last">Last</button>
          </>
        ) : (
          <p>no controls</p>
        )}
      </Sheet>
    </>
  );
  return withApp ? <div className="app">{inner}</div> : <div data-testid="root">{inner}</div>;
}

function DetachedModal({ open }: { open: boolean }) {
  const scrimRef = useRef<HTMLDivElement>(null);
  useModalDialog<HTMLDivElement>(open, () => undefined, scrimRef);
  return <div ref={scrimRef} />;
}

function ActivateRow({ onRun }: { onRun: () => void }) {
  return (
    <div role="button" tabIndex={0} onKeyDown={onActivate(onRun)}>
      row
    </div>
  );
}

describe('ui primitives', () => {
  it('renders spinner, loading row and screen placeholder', () => {
    render(
      <>
        <Spinner />
        <LoadingRow label="Loading…" />
        <ScreenPlaceholder title="Account" note="Coming later" />
      </>,
    );
    expect(document.querySelector('.spin')).toBeInTheDocument();
    expect(screen.getByText('Loading…')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Account' })).toBeInTheDocument();
    expect(screen.getByText('Coming later')).toBeInTheDocument();
  });

  it('throws when useToast is used outside ToastProvider', () => {
    expect(() => render(<OutsideToast />)).toThrow('useToast must be used within a ToastProvider');
  });

  it('shows polite and assertive toasts and hides them after their timers', () => {
    jest.useFakeTimers();
    const { unmount } = render(
      <ToastProvider>
        <ToastButtons />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'polite' }));
    expect(screen.getByRole('status')).toHaveClass('on');
    expect(screen.getByRole('status')).toHaveTextContent('copied');

    fireEvent.click(screen.getByRole('button', { name: 'polite' }));
    act(() => {
      jest.advanceTimersByTime(2199);
    });
    expect(screen.getByRole('status')).toHaveClass('on');
    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(screen.getByRole('status')).not.toHaveClass('on');

    fireEvent.click(screen.getByRole('button', { name: 'assertive' }));
    expect(screen.getByRole('alert')).toHaveClass('on');
    expect(screen.getByRole('alert')).toHaveTextContent('failed');
    fireEvent.click(screen.getByRole('button', { name: 'assertive' }));
    act(() => {
      jest.advanceTimersByTime(2600);
    });
    expect(screen.getByRole('alert')).not.toHaveClass('on');

    fireEvent.click(screen.getByRole('button', { name: 'polite' }));
    unmount();
    act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  it('sets inert on a closed element and skips an unattached ref', () => {
    const { rerender, getByTestId } = render(<InertProbe open={false} />);
    expect(getByTestId('inert-target')).toHaveProperty('inert', true);
    rerender(<InertProbe open />);
    expect(getByTestId('inert-target')).toHaveProperty('inert', false);
  });

  it('toggles the grab handle and closes from the header and scrim', () => {
    const onClose = jest.fn();
    const { rerender } = render(
      <Sheet open onClose={onClose} titleId="grab-title">
        <SheetHeader titleId="grab-title" title="Pick" onClose={onClose} />
      </Sheet>,
    );
    expect(document.querySelector('.grab')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(document.querySelector('.scrim') as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(2);

    rerender(
      <Sheet open={false} onClose={onClose} titleId="grab-title" showGrab={false}>
        <p>closed</p>
      </Sheet>,
    );
    expect(document.querySelector('.grab')).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { hidden: true })).toHaveAttribute('aria-hidden', 'true');
  });

  it('activates a row on Enter and Space and ignores other keys', () => {
    const onRun = jest.fn();
    render(<ActivateRow onRun={onRun} />);
    const row = screen.getByRole('button', { name: 'row' });
    fireEvent.keyDown(row, { key: 'Tab' });
    expect(onRun).not.toHaveBeenCalled();
    fireEvent.keyDown(row, { key: 'Enter' });
    fireEvent.keyDown(row, { key: ' ' });
    expect(onRun).toHaveBeenCalledTimes(2);
  });

  it('walks past non-element siblings, traps focus and restores a live opener', async () => {
    const { getByTestId, getByRole } = render(<ModalHarness />);
    const opener = getByTestId('opener');
    const layer = opener.parentElement as HTMLElement;
    layer.insertBefore(document.createTextNode('txt'), layer.firstChild);
    layer.appendChild(document.createComment('note'));
    layer.appendChild(document.createElementNS('http://www.w3.org/2000/svg', 'svg'));

    opener.focus();
    fireEvent.click(opener);
    await waitFor(() => expect(getByTestId('first')).toHaveFocus());

    fireEvent.keyDown(document, { key: 'ArrowDown' });
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(getByTestId('last')).toHaveFocus();

    getByTestId('first').focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(getByTestId('last')).toHaveFocus();

    fireEvent.keyDown(document, { key: 'Tab' });
    expect(getByTestId('first')).toHaveFocus();

    document.body.focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(getByTestId('last')).toHaveFocus();

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(getByRole('dialog', { hidden: true })).toHaveAttribute('aria-hidden', 'true'));
    expect(opener).toHaveFocus();
  });

  it('focuses the dialog when nothing is tabbable and skips a detached opener', async () => {
    const { getByTestId, getByRole } = render(<ModalHarness withFocusable={false} withApp={false} />);
    const opener = getByTestId('opener');
    opener.focus();
    fireEvent.click(opener);
    const dialog = getByRole('dialog');
    await waitFor(() => expect(dialog).toHaveFocus());

    fireEvent.keyDown(document, { key: 'Tab' });
    expect(dialog).toHaveFocus();

    opener.remove();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(getByRole('dialog', { hidden: true })).toHaveAttribute('aria-hidden', 'true'));
  });

  it('restores nothing when the previous focus was not an HTMLElement', async () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('tabindex', '0');
    document.body.appendChild(svg);
    (svg as SVGElement & { focus: () => void }).focus();

    render(<ModalHarness startOpen />);
    await waitFor(() => expect(screen.getByTestId('first')).toHaveFocus());
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.getByRole('dialog', { hidden: true })).toHaveAttribute('aria-hidden', 'true'));
    svg.remove();
  });

  it('no-ops the modal hook when the dialog ref is never attached', () => {
    const { rerender } = render(<DetachedModal open={false} />);
    rerender(<DetachedModal open />);
  });
});
