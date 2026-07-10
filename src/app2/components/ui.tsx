// DFX App 2.0 — shared design-system primitives (toast, sheet/modal, spinner).
//
// Structure and class names are ported 1:1 from the static preview
// (public/app2/index.html: `.toast`, `.sheet`, `.scrim`, `.spin` in the CSS,
// `toast()` / `openSheet()` / `openDialog()` in the inline script) so
// src/app2/styles.css applies unchanged.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';

/** Sets the DOM `inert` property imperatively — not in @types/react 18's JSX
 * attribute set, but a real, well-supported DOM property (Chrome/Firefox/Safari)
 * that (unlike `aria-hidden` alone) also pulls focusable descendants out of the
 * tab order and fully excludes the subtree from the accessibility tree, even
 * while it's still mounted (mid-close-transition) for the static app's CSS
 * slide-out to play. */
export function useInertWhenClosed<T extends HTMLElement>(open: boolean) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current as (HTMLElement & { inert: boolean }) | null;
    if (el) el.inert = !open;
  }, [open]);
  return ref;
}

// ---------------------------------------------------------------------------
// Spinner — inline loading indicator (`<Spinner /> {label}`, same as the
// static app's `<span class="spin"></span> ${t('loading')}` pattern).
// ---------------------------------------------------------------------------

export function Spinner() {
  return <span className="spin" aria-hidden="true" />;
}

export function LoadingRow({ label }: { label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <Spinner />
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Toast — mirrors the static app's `toast(message, assertive?)`: a polite
// status toast (2.2s) and a separate assertive/alert toast (2.6s) that can be
// shown independently, matching #toast / #toastA in the static markup.
// ---------------------------------------------------------------------------

interface ToastOptions {
  assertive?: boolean;
}

interface ToastContextValue {
  /** `showToast(t('copied'))`, or `showToast(t('authErr'), { assertive: true })` for alerts. */
  showToast: (message: string, options?: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

const TOAST_DURATION_MS = 2200;
const TOAST_DURATION_ASSERTIVE_MS = 2600;

const CHECK_ICON = (
  <svg viewBox="0 0 24 24" fill="none">
    <path d="M5 12l4 4 10-10" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [polite, setPolite] = useState({ message: '', open: false });
  const [assertive, setAssertive] = useState({ message: '', open: false });
  const politeTimer = useRef<ReturnType<typeof setTimeout>>();
  const assertiveTimer = useRef<ReturnType<typeof setTimeout>>();

  const showToast = useCallback((message: string, options?: ToastOptions) => {
    if (options?.assertive) {
      setAssertive({ message, open: true });
      clearTimeout(assertiveTimer.current);
      assertiveTimer.current = setTimeout(
        () => setAssertive((s) => ({ ...s, open: false })),
        TOAST_DURATION_ASSERTIVE_MS,
      );
      return;
    }
    setPolite({ message, open: true });
    clearTimeout(politeTimer.current);
    politeTimer.current = setTimeout(() => setPolite((s) => ({ ...s, open: false })), TOAST_DURATION_MS);
  }, []);

  useEffect(
    () => () => {
      clearTimeout(politeTimer.current);
      clearTimeout(assertiveTimer.current);
    },
    [],
  );

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className={`toast${polite.open ? ' on' : ''}`} role="status" aria-live="polite">
        <span className="ok">{CHECK_ICON}</span>
        <span>{polite.message}</span>
      </div>
      <div className={`toast${assertive.open ? ' on' : ''}`} role="alert" aria-live="assertive">
        <span className="ok">{CHECK_ICON}</span>
        <span>{assertive.message}</span>
      </div>
    </ToastContext.Provider>
  );
}

/** `const { showToast } = useToast();` from any app2 screen/component. */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}

// ---------------------------------------------------------------------------
// Sheet — the app's single modal primitive (bottom sheet on mobile widths).
// Renders the `.scrim` + `.sheet` pair; callers own the header/body markup so
// they can reuse `.shead`, `.grab`, `.slist`, etc. from styles.css untouched.
// ---------------------------------------------------------------------------

interface SheetProps {
  open: boolean;
  onClose: () => void;
  /** id of the element used as `aria-labelledby` (place it on your `<h3>`). */
  titleId: string;
  children: ReactNode;
  /** Set false for sheets whose content renders its own top affordance. */
  showGrab?: boolean;
}

export function Sheet({ open, onClose, titleId, children, showGrab = true }: SheetProps) {
  const ref = useInertWhenClosed<HTMLDivElement>(open);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [open, onClose]);

  return (
    <>
      <div className={`scrim${open ? ' on' : ''}`} onClick={onClose} aria-hidden="true" />
      <div
        ref={ref}
        className={`sheet${open ? ' on' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-hidden={!open}
      >
        {showGrab && <div className="grab" />}
        {children}
      </div>
    </>
  );
}

/** Standard `.shead` row for a Sheet: title + close button. */
export function SheetHeader({ titleId, title, onClose }: { titleId: string; title: string; onClose: () => void }) {
  return (
    <div className="shead">
      <div className="r1">
        <h3 id={titleId}>{title}</h3>
        <button className="rbtn" aria-label="Close" style={{ width: 44, height: 44 }} onClick={onClose}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}

/** Makes a non-`<button>` row keyboard-activatable, matching `enhanceA11y()` in the static app. */
export function onActivate(handler: () => void) {
  return (e: ReactKeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handler();
    }
  };
}

// ---------------------------------------------------------------------------
// ScreenPlaceholder — used by the milestone-1 route stubs (account/tx/kyc/
// support). Reuses `.account` / `.txhead` / `.tnote`, the same wrapper the
// static app uses for its full-screen views, so the placeholder already sits
// correctly once a real screen replaces it.
// ---------------------------------------------------------------------------

export function ScreenPlaceholder({ title, note }: { title: string; note: string }) {
  return (
    <div className="account">
      <div className="txhead">
        <h2>{title}</h2>
      </div>
      <p className="tnote" style={{ padding: '0 4px 8px' }}>
        {note}
      </p>
    </div>
  );
}
