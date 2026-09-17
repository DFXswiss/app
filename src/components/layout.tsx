import { PropsWithChildren, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useLayoutConfigContext } from 'src/contexts/layout-config.context';
import { useLayoutContext } from 'src/contexts/layout.context';
import { Routes } from '../App';
import { useAppParams } from '../hooks/app-params.hook';
import { useNavigation } from '../hooks/navigation.hook';
import { isNode } from '../util/utils';
import { InfoBannerComponent } from './info-banner';
import { Navigation } from './navigation';

export function Layout({ children }: PropsWithChildren): JSX.Element {
  const {
    config: { title, backButton, onBack, textStart, noPadding, noMaxWidth, smallMenu },
  } = useLayoutConfigContext();

  const navRef = useRef<HTMLDivElement>(null);
  const { modalRootRef, scrollRef, rootRef } = useLayoutContext();

  const [isNavigationOpen, setIsNavigationOpen] = useState(false);
  const { pathname } = useLocation();
  const { clearParams } = useNavigation();
  const { borderless } = useAppParams();

  useEffect(() => {
    const kycRoutes = Routes[0].children?.filter((r) => r.isKycScreen) || [];
    if (!kycRoutes.some((r) => pathname === `/${r.path}`)) clearParams(['code']);
  }, [pathname]);

  function onClick(e: React.MouseEvent<HTMLDivElement, MouseEvent>) {
    if (isNavigationOpen && isNode(e.target) && navRef.current && !navRef.current.contains(e.target)) {
      setIsNavigationOpen(false);
    }
  }

  return (
    <div id="app-root" className="h-full flex flex-col" ref={rootRef} onClick={onClick}>
      <Navigation
        ref={navRef}
        title={title}
        backButton={backButton}
        onBack={onBack}
        isOpen={isNavigationOpen}
        setIsOpen={setIsNavigationOpen}
        small={smallMenu}
      />

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
            className={`relative w-full ${!noMaxWidth && 'max-w-screen-md'} flex flex-grow flex-col items-center ${
              textStart ? 'text-start' : 'text-center'
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
