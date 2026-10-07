const originalPublicUrl = process.env.REACT_APP_PUBLIC_URL;
const originalLocation = window.location;

jest.mock('@dfx.swiss/react-components', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const React = require('react');

  return {
    StyledButton: ({ label, onClick }: any) => React.createElement('button', { onClick }, label),
    StyledVerticalStack: ({ children }: any) => React.createElement('div', null, children),
    StyledButtonColor: { GRAY_OUTLINE: 'gray-outline' },
    StyledButtonWidth: { MIN: 'min' },
  };
});

jest.mock('../contexts/settings.context', () => ({
  useSettingsContext: () => ({ translate: (_namespace: string, text: string) => text }),
}));

import { fireEvent, render, screen } from '@testing-library/react';
import { KycIdentNewTab, kycIdentUrl } from '../components/kyc-ident-new-tab';

let openSpy: jest.SpyInstance;

beforeEach(() => {
  process.env.REACT_APP_PUBLIC_URL = 'https://app.example';
  Object.defineProperty(window, 'location', {
    configurable: true,
    writable: true,
    value: { ...originalLocation, origin: 'https://embedding.example' },
  });
  openSpy = jest.spyOn(window, 'open').mockImplementation(() => null);
});

afterEach(() => {
  openSpy.mockRestore();
  Object.defineProperty(window, 'location', {
    configurable: true,
    writable: true,
    value: originalLocation,
  });

  if (originalPublicUrl === undefined) {
    delete process.env.REACT_APP_PUBLIC_URL;
  } else {
    process.env.REACT_APP_PUBLIC_URL = originalPublicUrl;
  }
});

describe('kycIdentUrl', () => {
  it('uses the configured app origin', () => {
    expect(kycIdentUrl('code')).toBe('https://app.example/kyc?code=code');
  });

  it('uses window.location.origin when the configured origin is unset', () => {
    delete process.env.REACT_APP_PUBLIC_URL;

    expect(kycIdentUrl('code')).toBe('https://embedding.example/kyc?code=code');
  });

  it('URL-encodes the KYC code', () => {
    expect(kycIdentUrl('a b&c')).toBe('https://app.example/kyc?code=a+b%26c');
  });
});

describe('KycIdentNewTab', () => {
  it('opens the identification in a new tab', () => {
    render(<KycIdentNewTab code="a b&c" onBack={jest.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Open identification' }));

    expect(openSpy).toHaveBeenCalledWith('https://app.example/kyc?code=a+b%26c', '_blank', 'noopener,noreferrer');
  });

  it('continues by returning to the KYC flow', () => {
    const onBack = jest.fn();
    render(<KycIdentNewTab code="code" onBack={onBack} />);

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
