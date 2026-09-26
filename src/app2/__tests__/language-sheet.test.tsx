import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useRef } from 'react';
import { LanguageProvider, useT } from '../i18n';
import { LanguageMenu, LanguageSheet } from '../components/LanguageSheet';
import { ToastProvider } from '../components/ui';

const mockUpdateLanguage = jest.fn();
const mockSession = { isLoggedIn: false };
let mockLanguages: Array<{ symbol: string; name: string; enable: boolean }> | undefined;
let mockUser: { accountId: number } | undefined;

jest.mock('@dfx.swiss/react', () => ({
  useLanguageContext: () => ({ languages: mockLanguages }),
  useUserContext: () => ({ user: mockUser, updateLanguage: mockUpdateLanguage }),
}));

jest.mock('../wallets/session', () => ({
  useWalletSession: () => mockSession,
}));

function MenuHarness({ startOpen = true }: { startOpen?: boolean }) {
  const anchorRef = useRef<HTMLButtonElement>(null);
  return (
    <LanguageProvider>
      <ToastProvider>
        <button ref={anchorRef} type="button">
          pill
        </button>
        <LanguageMenu open={startOpen} onClose={jest.fn()} anchorRef={anchorRef} />
      </ToastProvider>
    </LanguageProvider>
  );
}

function LanguageReadout() {
  const { language } = useT();
  return <output data-testid="active-language">{language}</output>;
}

function SheetHarness({ onClose }: { onClose: () => void }) {
  return (
    <LanguageProvider>
      <ToastProvider>
        <LanguageSheet open onClose={onClose} />
        <LanguageReadout />
      </ToastProvider>
    </LanguageProvider>
  );
}

describe('LanguageSheet and LanguageMenu', () => {
  beforeEach(() => {
    mockUpdateLanguage.mockReset();
    mockUpdateLanguage.mockResolvedValue(undefined);
    mockSession.isLoggedIn = false;
    mockLanguages = [
      { symbol: 'DE', name: 'Deutsch', enable: true },
      { symbol: 'EN', name: 'English', enable: true },
      { symbol: 'FR', name: 'Français', enable: true },
    ];
    mockUser = { accountId: 42 };
    window.localStorage.removeItem('dfx_lang');
  });

  it('picks a language from the sheet on click and keyboard', async () => {
    const onClose = jest.fn();
    render(
      <LanguageProvider>
        <ToastProvider>
          <LanguageSheet open onClose={onClose} />
        </ToastProvider>
      </LanguageProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /deutsch/i }));
    expect(onClose).toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('Deutsch');

    fireEvent.keyDown(screen.getByRole('button', { name: /english/i }), { key: 'Enter' });
    expect(onClose).toHaveBeenCalledTimes(2);

    fireEvent.keyDown(screen.getByRole('button', { name: /français/i }), { key: 'Tab' });
    expect(onClose).toHaveBeenCalledTimes(2);
    fireEvent.keyDown(screen.getByRole('button', { name: /italiano/i }), { key: ' ' });
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('mirrors the language to the API when logged in and toasts a failure', async () => {
    mockSession.isLoggedIn = true;
    mockUpdateLanguage.mockRejectedValueOnce(new Error('down'));
    const onClose = jest.fn();
    render(<SheetHarness onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: /deutsch/i }));
    await waitFor(() => expect(mockUpdateLanguage).toHaveBeenCalled());
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId('active-language')).toHaveTextContent('en');
  });

  it('does not report local success for a signed-in click before account and language data load, then retries', async () => {
    mockSession.isLoggedIn = true;
    mockLanguages = undefined;
    mockUser = undefined;
    const onClose = jest.fn();
    const view = render(<SheetHarness onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: /deutsch/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Account settings are still loading');
    expect(mockUpdateLanguage).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId('active-language')).toHaveTextContent('en');

    mockLanguages = [
      { symbol: 'DE', name: 'Deutsch', enable: true },
      { symbol: 'EN', name: 'English', enable: true },
      { symbol: 'FR', name: 'Français', enable: true },
    ];
    mockUser = { accountId: 42 };
    view.rerender(<SheetHarness onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /deutsch/i }));
    await waitFor(() => expect(mockUpdateLanguage).toHaveBeenCalledWith(mockLanguages?.[0]));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('active-language')).toHaveTextContent('de');
  });

  it('does not apply an in-flight language success after the signed-in account changes', async () => {
    mockSession.isLoggedIn = true;
    let resolveUpdate!: () => void;
    mockUpdateLanguage.mockImplementationOnce(() => new Promise<void>((resolve) => { resolveUpdate = resolve; }));
    const onClose = jest.fn();
    const view = render(<SheetHarness onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: /deutsch/i }));
    await waitFor(() => expect(mockUpdateLanguage).toHaveBeenCalled());
    mockSession.isLoggedIn = false;
    mockUser = undefined;
    view.rerender(<SheetHarness onClose={onClose} />);
    await act(async () => { resolveUpdate(); });

    expect(await screen.findByRole('alert')).toHaveTextContent('Your session changed');
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId('active-language')).toHaveTextContent('en');
  });

  it('serializes quick language choices in click order instead of overlapping API updates', async () => {
    mockSession.isLoggedIn = true;
    let resolveFirst!: () => void;
    mockUpdateLanguage.mockImplementationOnce(() => new Promise<void>((resolve) => { resolveFirst = resolve; }));
    const onClose = jest.fn();
    render(<SheetHarness onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: /deutsch/i }));
    await waitFor(() => expect(mockUpdateLanguage).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: /français/i }));
    expect(mockUpdateLanguage).toHaveBeenCalledTimes(1);

    await act(async () => { resolveFirst(); });
    await waitFor(() => expect(mockUpdateLanguage).toHaveBeenCalledTimes(2));
    expect(mockUpdateLanguage.mock.calls[0][0]).toMatchObject({ symbol: 'DE' });
    expect(mockUpdateLanguage.mock.calls[1][0]).toMatchObject({ symbol: 'FR' });
    await waitFor(() => expect(screen.getByTestId('active-language')).toHaveTextContent('fr'));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('drops a queued language write when its signed-in account changes before it reaches the API', async () => {
    mockSession.isLoggedIn = true;
    let resolveFirst!: () => void;
    mockUpdateLanguage.mockImplementationOnce(() => new Promise<void>((resolve) => { resolveFirst = resolve; }));
    const onClose = jest.fn();
    const view = render(<SheetHarness onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: /deutsch/i }));
    await waitFor(() => expect(mockUpdateLanguage).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: /français/i }));
    expect(mockUpdateLanguage).toHaveBeenCalledTimes(1);

    // Keep the session authenticated while switching accounts: this isolates the epoch check
    // from the separate `!isLoggedIn` guard.
    mockUser = { accountId: 43 };
    view.rerender(<SheetHarness onClose={onClose} />);
    await act(async () => { resolveFirst(); });

    await waitFor(() => expect(mockUpdateLanguage).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole('alert')).toHaveTextContent('Your session changed');
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId('active-language')).toHaveTextContent('en');
  });

  it('uses the same fail-closed persistence path from the header language menu', async () => {
    mockSession.isLoggedIn = true;
    mockLanguages = undefined;
    mockUser = { accountId: 42 };
    const onClose = jest.fn();
    const anchorRef = { current: document.createElement('button') };
    render(
      <LanguageProvider>
        <ToastProvider>
          <LanguageMenu open onClose={onClose} anchorRef={anchorRef} />
          <LanguageReadout />
        </ToastProvider>
      </LanguageProvider>,
    );

    fireEvent.click(screen.getByRole('menuitem', { name: /deutsch/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Account settings are still loading');
    expect(mockUpdateLanguage).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId('active-language')).toHaveTextContent('en');
  });

  it('closes the menu on outside click and Escape, and moves with arrow keys', async () => {
    const onClose = jest.fn();
    const anchorRef = { current: document.createElement('button') };
    document.body.appendChild(anchorRef.current);

    render(
      <LanguageProvider>
        <ToastProvider>
          <LanguageMenu open onClose={onClose} anchorRef={anchorRef} />
        </ToastProvider>
      </LanguageProvider>,
    );

    await waitFor(() => expect(document.querySelector('.lopt.sel')).toBeTruthy());
    await act(async () => {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
      });
    });

    fireEvent.mouseDown(screen.getByRole('menu'));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.mouseDown(anchorRef.current);
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.keyDown(screen.getByRole('menu'), { key: 'ArrowDown' });
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'ArrowUp' });
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Home' });
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'End' });
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Tab' });

    fireEvent.keyDown(screen.getByRole('menuitem', { name: /français/i }), { key: 'Tab' });
    fireEvent.click(document.querySelector('.lopt') as HTMLElement);
    expect(onClose).toHaveBeenCalled();
    fireEvent.keyDown(document.querySelector('.lopt') as HTMLElement, { key: 'Enter' });
    fireEvent.keyDown(document.querySelectorAll('.lopt')[1] as HTMLElement, { key: ' ' });
    expect(onClose).toHaveBeenCalledTimes(3);

    fireEvent.mouseDown(document.body);
    expect(onClose).toHaveBeenCalledTimes(4);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(5);

    anchorRef.current.remove();
  });

  it('does not attach listeners while the menu is closed', () => {
    render(<MenuHarness startOpen={false} />);
    fireEvent.mouseDown(document.body);
    fireEvent.keyDown(document, { key: 'Escape' });
  });

  it('ignores arrow keys when the menu has no options', async () => {
    const onClose = jest.fn();
    const anchorRef = { current: document.createElement('button') };
    document.body.appendChild(anchorRef.current);
    render(
      <LanguageProvider>
        <ToastProvider>
          <LanguageMenu open onClose={onClose} anchorRef={anchorRef} />
        </ToastProvider>
      </LanguageProvider>,
    );
    const menu = screen.getByRole('menu');
    jest.spyOn(menu, 'querySelectorAll').mockReturnValue([] as unknown as NodeListOf<HTMLElement>);
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(onClose).not.toHaveBeenCalled();
    anchorRef.current.remove();
  });
});
