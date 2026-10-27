import { PropsWithChildren, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useLayoutConfigContext } from 'src/contexts/layout-config.context';
import { useLayoutContext } from 'src/contexts/layout.context';
import { Routes } from '../App';
import { useAppParams } from '../hooks/app-params.hook';
import { useNavigation } from '../hooks/navigation.hook';
import { isNode } from '../util/utils';
import { isWebComponent } from '../util/web-component-mode';
import { InfoBannerComponent } from './info-banner';
import { Navigation } from './navigation';

export function Layout({ children }: PropsWithChildren): JSX.Element {
  const {
    config: { title, backButton, onBack, textStart, noPadding, noMaxWidth, smallMenu },
  } = useLayoutConfigContext();

  const navRef = useRef<HTMLDivElement>(null);
  const { modalRootRef, scrollRef, rootRef } = useLayoutContext();

  const [isNavigationOpen, setIsNavigationOpen] = useState(false);
  const { pathname, search } = useLocation();
  const isRealunitWorkspace = pathname === '/realunit' || pathname.startsWith('/realunit/');
  const { clearParams } = useNavigation();
  const { borderless } = useAppParams();
  const webComponent = isWebComponent();

  // Only navigate when there is a code to drop. This effect runs after the effects of the screen
  // mounted in the same commit (e.g. when the whole tree mounts at once after the deleted-address
  // gate releases it), and clearParams replaces the URL with this render's pathname — an
  // unconditional call would undo a redirect that screen just made.
  useEffect(() => {
    const kycRoutes = Routes[0].children?.filter((r) => r.isKycScreen) || [];
    const hasCode = new URLSearchParams(search).has('code');
    if (hasCode && !kycRoutes.some((r) => pathname === `/${r.path}`)) clearParams(['code']);
  }, [pathname]);

  function onClick(e: React.MouseEvent<HTMLDivElement, MouseEvent>) {
    if (isNavigationOpen && isNode(e.target) && navRef.current && !navRef.current.contains(e.target)) {
      setIsNavigationOpen(false);
    }
  }

  return (
    <div
      id="app-root"
      className={`h-full flex flex-col ${webComponent ? 'relative' : ''}`}
      ref={rootRef}
      onClick={onClick}
    >
      <Navigation
        ref={navRef}
        title={title}
        backButton={backButton}
        onBack={onBack}
        isOpen={isNavigationOpen}
        setIsOpen={setIsNavigationOpen}
        small={smallMenu}
      />

      {/* Widget-scoped stand-in for the navigation's page-wide backdrop */}
      {webComponent && isNavigationOpen && (
        <div className="absolute inset-0 z-40" onClick={() => setIsNavigationOpen(false)} />
      )}

      <div
        className="relative flex flex-col flex-grow overflow-auto"
        ref={(el) => {
          if (el) {
            modalRootRef.current = el;
            scrollRef.current = el;
          }
        }}
      >
        <div className="flex flex-grow justify-center">
          <div
            className={`relative w-full ${!noMaxWidth && !isRealunitWorkspace && 'max-w-screen-md'} flex flex-grow flex-col items-center ${
              textStart || isRealunitWorkspace ? 'text-start' : 'text-center'
            } ${!(noPadding || borderless) && 'p-5'} gap-2`}
          >
            {pathname.startsWith('/support') && <InfoBannerComponent />}
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
