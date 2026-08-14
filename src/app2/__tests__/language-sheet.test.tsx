import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useRef } from 'react';
import { LanguageProvider } from '../i18n';
import { LanguageMenu, LanguageSheet } from '../components/LanguageSheet';
import { ToastProvider } from '../components/ui';

const mockUpdateLanguage = jest.fn();
const mockSession = { isLoggedIn: false };

jest.mock('@dfx.swiss/react', () => ({
  useLanguageContext: () => ({
    languages: [
      { symbol: 'DE', name: 'Deutsch' },
      { symbol: 'EN', name: 'English' },
    ],
  }),
  useUserContext: () => ({ updateLanguage: mockUpdateLanguage }),
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

describe('LanguageSheet and LanguageMenu', () => {
  beforeEach(() => {
    mockUpdateLanguage.mockReset();
    mockUpdateLanguage.mockResolvedValue(undefined);
    mockSession.isLoggedIn = false;
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
    render(
      <LanguageProvider>
        <ToastProvider>
          <LanguageSheet open onClose={onClose} />
        </ToastProvider>
      </LanguageProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /deutsch/i }));
    await waitFor(() => expect(mockUpdateLanguage).toHaveBeenCalled());
    expect(await screen.findByRole('alert')).toBeInTheDocument();
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
