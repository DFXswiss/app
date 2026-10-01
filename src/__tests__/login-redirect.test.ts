jest.mock('@dfx.swiss/react', () => ({}));

import { loginRedirectParams } from '../util/login-redirect';

describe('loginRedirectParams', () => {
  it('forwards only personal-iban from the page query when not a widget', () => {
    const params = loginRedirectParams({ isWidget: false }, '?user=a@example.com&personal-iban=frick&x=1');
    expect(params.get('personal-iban')).toBe('frick');
    expect([...params.keys()]).toEqual(['personal-iban']);
  });

  it('returns empty params when not a widget and personal-iban is absent', () => {
    const params = loginRedirectParams({ isWidget: false }, '?user=a@example.com&x=1');
    expect([...params.keys()]).toEqual([]);
  });

  it('ignores widgetPersonalIban when not a widget', () => {
    const params = loginRedirectParams({ isWidget: false, widgetPersonalIban: 'frick' }, '?user=a@example.com&x=1');
    expect([...params.keys()]).toEqual([]);
  });

  it('forwards the widget attribute and ignores the page query when embedded', () => {
    const params = loginRedirectParams(
      { isWidget: true, widgetPersonalIban: 'frick' },
      '?personal-iban=yapeal&foo=bar',
    );
    expect(params.get('personal-iban')).toBe('frick');
    expect([...params.keys()]).toEqual(['personal-iban']);
  });

  it('returns empty params when embedded without a widget attribute', () => {
    const params = loginRedirectParams({ isWidget: true }, '?personal-iban=yapeal');
    expect([...params.keys()]).toEqual([]);
  });

  it('forwards an empty-string widget attribute as personal-iban with an empty value', () => {
    const params = loginRedirectParams({ isWidget: true, widgetPersonalIban: '' }, '');
    expect(params.has('personal-iban')).toBe(true);
    expect(params.get('personal-iban')).toBe('');
    expect(params.toString()).toBe('personal-iban=');
  });
});
