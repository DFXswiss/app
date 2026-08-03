import { useAuthContext, UserRole, useSessionContext, useUserContext } from '@dfx.swiss/react';
import { isPartnerDashboardRole, SUPPORT_DASHBOARD_ROLES } from 'src/hooks/guard.hook';
import {
  DfxIcon,
  IconColor,
  IconSize,
  IconVariant,
  StyledButton,
  StyledButtonColor,
  StyledButtonWidth,
} from '@dfx.swiss/react-components';
import { forwardRef, PropsWithChildren, SetStateAction } from 'react';
import { useLocation } from 'react-router-dom';
import { REACT_APP_BUILD_ID } from 'src/version';
import { Urls } from '../config/urls';
import { CloseType, useAppHandlingContext } from '../contexts/app-handling.context';
import { useSettingsContext } from '../contexts/settings.context';
import { useNavigation } from '../hooks/navigation.hook';
import { NavigationLink } from './navigation-link';

interface BackButtonProps extends PropsWithChildren {
  onBack?: () => void;
}

interface NavigationIframeProps extends BackButtonProps {
  title?: string;
  backButton?: boolean;
  isOpen: boolean;
  small?: boolean;
  setIsOpen: (value: SetStateAction<boolean>) => void;
}

interface IconContentProps {
  icon: IconVariant;
  setIsNavigationOpen: (value: SetStateAction<boolean>) => void;
}

interface NavigationMenuContentProps {
  setIsNavigationOpen: (value: SetStateAction<boolean>) => void;
  small?: boolean;
}

export const Navigation = forwardRef<HTMLDivElement, NavigationIframeProps>(
  ({ title, backButton = true, onBack, isOpen, setIsOpen, small = false }: NavigationIframeProps, ref): JSX.Element => {
    const { params, isEmbedded } = useAppHandlingContext();

    return title || !isEmbedded ? (
      <div
        className={`flex w-full h-12 px-4 py-5 items-center justify-center ${
          params.headless !== 'true' ? 'relative bg-dfxGray-300' : ''
        }`}
        ref={ref}
      >
        {params.headless !== 'true' && (
          <>
            {backButton && <BackButton onBack={onBack} />}
            {title ? (
              <div className="text-dfxBlue-800 font-bold text-lg mx-8 line-clamp-1 select-none">{title}</div>
            ) : (
              !isEmbedded && <DfxLogo />
            )}
          </>
        )}

        <div className="absolute right-4 z-10">
          <MenuIcon icon={isOpen ? IconVariant.CLOSE : IconVariant.MENU} setIsNavigationOpen={setIsOpen} />
        </div>

        {isOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
            <NavigationMenu setIsNavigationOpen={setIsOpen} small={small} />
          </>
        )}
      </div>
    ) : (
      <></>
    );
  },
);

function BackButton({ onBack }: BackButtonProps): JSX.Element {
  const { closeServices } = useAppHandlingContext();
  const { pathname } = useLocation();
  const { navigate } = useNavigation();

  function onClick() {
    if (pathname === '/') {
      closeServices({ type: CloseType.CANCEL }, false);
    } else {
      navigate(-1);
    }
  }

  return (
    <button className="absolute left-4 pl-2" onClick={onBack ?? onClick}>
      <DfxIcon icon={IconVariant.BACK} color={IconColor.BLUE} size={IconSize.LG} />
    </button>
  );
}

function DfxLogo(): JSX.Element {
  return (
    <a href="/">
      <img height={23} width={73.6} src="https://dfx.swiss/images/app/logo-dark.svg" alt="logo" />
    </a>
  );
}

function MenuIcon({ icon, setIsNavigationOpen }: IconContentProps): JSX.Element {
  return (
    <div className="cursor-pointer" onClick={() => setIsNavigationOpen((prev) => !prev)}>
      <DfxIcon icon={icon} size={IconSize.LG} color={IconColor.BLUE} />
    </div>
  );
}

function NavigationMenu({ setIsNavigationOpen, small = false }: NavigationMenuContentProps): JSX.Element {
  const { navigate } = useNavigation();
  const { translate } = useSettingsContext();
  const { hasCustody } = useUserContext();
  const { isLoggedIn, logout: apiLogout } = useSessionContext();
  const { session } = useAuthContext();

  async function login() {
    navigate('/login');
    setIsNavigationOpen(false);
  }

  async function logout() {
    await apiLogout();
    setIsNavigationOpen(false);
  }

  return (
    <nav onClick={(e) => e.stopPropagation()}>
      <div className="fixed top-14 right-2 border border-dfxGray-400 shadow-lg w-64 z-50 flex flex-col bg-dfxGray-300 rounded-lg">
        <div className="mx-4 py-4 text-dfxGray-800">
          {!small && (
            <>
              <NavigationLink
                icon={IconVariant.BANK}
                label={translate('navigation/links', 'Buy')}
                url="/buy"
                target="_self"
                onClose={() => setIsNavigationOpen(false)}
              />
              <NavigationLink
                icon={IconVariant.SELL}
                label={translate('navigation/links', 'Sell')}
                url="/sell"
                target="_self"
                onClose={() => setIsNavigationOpen(false)}
              />
              <NavigationLink
                icon={IconVariant.SWAP}
                label={translate('navigation/links', 'Swap')}
                url="/swap"
                target="_self"
                onClose={() => setIsNavigationOpen(false)}
              />

              <NavigationLink
                icon={IconVariant.ACCOUNT}
                label={translate('screens/home', 'Account')}
                url="/account"
                target="_self"
                onClose={() => setIsNavigationOpen(false)}
              />

              {hasCustody && (
                <NavigationLink
                  icon={IconVariant.SAFE}
                  label={translate('navigation/links', 'Safe')}
                  url="/safe"
                  target="_self"
                  onClose={() => setIsNavigationOpen(false)}
                />
              )}
              <NavigationLink
                icon={IconVariant.TRANSACTIONS}
                label={translate('screens/payment', 'Transactions')}
                url="/tx"
                target="_self"
                onClose={() => setIsNavigationOpen(false)}
              />
              <NavigationLink
                icon={IconVariant.KYC}
                label={translate('navigation/links', 'KYC')}
                url="/kyc"
                target="_self"
                onClose={() => setIsNavigationOpen(false)}
              />
              <NavigationLink
                icon={IconVariant.SETTINGS}
                label={translate('screens/settings', 'Settings')}
                url="/settings"
                target="_self"
                onClose={() => setIsNavigationOpen(false)}
              />
              {session?.role && [UserRole.ADMIN, UserRole.COMPLIANCE].includes(session.role) && (
                <NavigationLink
                  icon={IconVariant.COMPLIANCE}
                  label={translate('screens/compliance', 'Compliance')}
                  url="/compliance"
                  target="_self"
                  onClose={() => setIsNavigationOpen(false)}
                />
              )}
              {session?.role && SUPPORT_DASHBOARD_ROLES.includes(session.role) && (
                <NavigationLink
                  icon={IconVariant.SUPPORT}
                  label={translate('screens/support', 'Support Dashboard')}
                  url="/support/dashboard"
                  target="_self"
                  onClose={() => setIsNavigationOpen(false)}
                />
              )}
              {session?.role && isPartnerDashboardRole(session.role) && (
                <NavigationLink
                  icon={IconVariant.REFERRAL}
                  label={translate('screens/partner', 'Non-Custodial Partner Program')}
                  url="/partner/dashboard"
                  target="_self"
                  onClose={() => setIsNavigationOpen(false)}
                />
              )}
              {session?.role && [UserRole.ADMIN, UserRole.REALUNIT, UserRole.COMPLIANCE].includes(session.role) && (
                <NavigationLink
                  icon={IconVariant.WALLET}
                  label={translate('screens/realunit', 'RealUnit')}
                  url="/realunit"
                  target="_self"
                  onClose={() => setIsNavigationOpen(false)}
                />
              )}
              {session?.role === UserRole.ADMIN && (
                <NavigationLink
                  icon={IconVariant.FILE}
                  label={translate('screens/dashboard-financial', 'Financial')}
                  url="/dashboard/financial/overview"
                  target="_self"
                  onClose={() => setIsNavigationOpen(false)}
                />
              )}
              {session?.role === UserRole.ADMIN && (
                <NavigationLink
                  icon={IconVariant.MENU}
                  label={translate('screens/sitemap', 'Sitemap')}
                  url="/sitemap"
                  target="_self"
                  onClose={() => setIsNavigationOpen(false)}
                />
              )}
            </>
          )}

          <NavigationLink
            icon={IconVariant.HOME}
            label={translate('navigation/links', 'DFX.swiss')}
            url={Urls.dfx}
            onClose={() => setIsNavigationOpen(false)}
          />
          <NavigationLink
            icon={IconVariant.SUPPORT}
            label={translate('navigation/links', 'Support')}
            url="/support"
            target="_self"
            onClose={() => setIsNavigationOpen(false)}
          />
          <NavigationLink
            icon={IconVariant.OPEN_CRYPTOPAY}
            label={translate('navigation/links', 'Open CryptoPay')}
            url="https://opencryptopay.io/"
            target="_blank"
            onClose={() => setIsNavigationOpen(false)}
          />
          <NavigationLink
            icon={IconVariant.FILE}
            label={translate('navigation/links', 'Terms and conditions')}
            url={Urls.termsAndConditions}
            onClose={() => setIsNavigationOpen(false)}
          />
          <NavigationLink
            icon={IconVariant.OPEN_IN_NEW}
            label={translate('navigation/links', 'Privacy policy')}
            url={Urls.privacyPolicy}
            onClose={() => setIsNavigationOpen(false)}
          />
          <NavigationLink
            icon={IconVariant.OPEN_IN_NEW}
            label={translate('navigation/links', 'Imprint')}
            url={Urls.imprint}
            onClose={() => setIsNavigationOpen(false)}
          />

          <StyledButton
            className="mt-4"
            label={translate('general/actions', isLoggedIn ? 'Logout' : 'Login')}
            onClick={isLoggedIn ? logout : login}
            color={StyledButtonColor.STURDY_WHITE}
            width={StyledButtonWidth.FULL}
            hidden={small && !isLoggedIn}
          />

          <div className="flex mt-4 text-xs text-dfxGray-700 w-full justify-center">
            <p>{REACT_APP_BUILD_ID}</p>
          </div>
        </div>
      </div>
    </nav>
  );
}
