// KycScreen steps whose names and addresses the API checks against the payment character set:
// field errors for unsupported characters, apostrophe normalization on submit, and the
// translated hint when the API still rejects the input.

const mockStartStep = jest.fn();
const mockSetPersonalData = jest.fn();
const mockSetBeneficialData = jest.fn();
const mockSetAddressChangeData = jest.fn();
const mockSetNameChangeData = jest.fn();
const mockReportClientError = jest.fn();

jest.mock('@dfx.swiss/react', () => ({
  AccountType: { PERSONAL: 'Personal', ORGANIZATION: 'Organization' },
  KycLevel: { Link: 10, Sell: 30, Completed: 50 },
  KycStepName: {
    CONTACT_DATA: 'ContactData',
    PERSONAL_DATA: 'PersonalData',
    BENEFICIAL_OWNER: 'BeneficialOwner',
    ADDRESS_CHANGE: 'AddressChange',
    NAME_CHANGE: 'NameChange',
  },
  KycStepStatus: { NOT_STARTED: 'NotStarted', IN_PROGRESS: 'InProgress', FAILED: 'Failed' },
  KycStepType: { VIDEO: 'Video', AUTO: 'Auto', SUMSUB_VIDEO: 'SumsubVideo', SUMSUB_AUTO: 'SumsubAuto' },
  KycStepCancelable: [],
  KycStepReason: {},
  UrlType: { BROWSER: 'Browser' },
  isStepDone: () => false,
  Utils: {
    createRules: (rules: Record<string, any>) =>
      Object.fromEntries(
        Object.entries(rules).map(([key, value]) => [
          key,
          Array.isArray(value) ? value.reduce((prev, curr) => ({ ...prev, ...curr }), {}) : value,
        ]),
      ),
  },
  Validations: {
    get Required() {
      return { required: { value: true, message: 'required' } };
    },
    get Phone() {
      return { validate: () => true };
    },
    Custom: (validator: (value: any) => true | string) => ({ validate: validator }),
  },
  useKyc: () => ({
    startStep: mockStartStep,
    setPersonalData: mockSetPersonalData,
    setBeneficialData: mockSetBeneficialData,
    setAddressChangeData: mockSetAddressChangeData,
    setNameChangeData: mockSetNameChangeData,
  }),
  useUserContext: () => ({ user: undefined, reloadUser: jest.fn() }),
  useSessionContext: () => ({ logout: jest.fn() }),
}));

jest.mock('@dfx.swiss/react-components', () => {
  // babel-plugin-jest-hoist runs this factory before file imports — require React / RHF here.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const React = require('react');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Controller } = require('react-hook-form');

  const errorAt = (errors: any, name: string) => name.split('.').reduce((e, key) => e?.[key], errors);

  function enrich(children: any, form: any): any {
    return React.Children.map(children, (child: any) => {
      if (!React.isValidElement(child)) return child;
      const props: any = child.props;
      const nested = enrich(props.children, form);
      if (!props.name) return React.cloneElement(child, { children: nested });
      return React.cloneElement(child, {
        control: form.control,
        rules: form.rules?.[props.name],
        error: errorAt(form.errors, props.name),
        translate: form.translate,
        children: nested,
      });
    });
  }

  const Form = ({ children, ...form }: any) => React.createElement('form', null, enrich(children, form));

  const field = (render: (field: any) => any) =>
    function Field({ control, name, rules, error, translate, items, labelFunc }: any) {
      return React.createElement(Controller, {
        control,
        name,
        rules,
        render: ({ field: f }: any) =>
          React.createElement(
            'div',
            null,
            render({ ...f, name, items, labelFunc }),
            error ? React.createElement('p', null, translate(error.message)) : null,
          ),
      });
    };

  const StyledInput = field(({ name, value, onChange, onBlur }) =>
    React.createElement('input', {
      'data-testid': name,
      value: value ?? '',
      onBlur,
      onChange: (e: any) => onChange(e.target.value),
    }),
  );

  const StyledFileUpload = field(({ name, onChange }) =>
    React.createElement('input', {
      'data-testid': name,
      type: 'file',
      onChange: (e: any) => onChange(e.target.files[0]),
    }),
  );

  const StyledDropdown = field(({ name, onChange, items, labelFunc }) =>
    React.createElement(
      'div',
      null,
      items.map((item: any, i: number) =>
        React.createElement(
          'button',
          { key: i, type: 'button', 'data-testid': `${name}-option-${i}`, onClick: () => onChange(item) },
          labelFunc(item),
        ),
      ),
    ),
  );

  const StyledButton = ({ label, onClick, disabled, isLoading }: any) =>
    React.createElement('button', { type: 'button', onClick, disabled: disabled || isLoading }, label);

  const Stack = ({ children }: any) => React.createElement('div', null, children);

  return {
    Form,
    StyledInput,
    StyledFileUpload,
    StyledDropdown,
    StyledSearchDropdown: StyledDropdown,
    StyledButton,
    StyledVerticalStack: Stack,
    StyledHorizontalStack: Stack,
    StyledLoadingSpinner: () => React.createElement('div', { 'data-testid': 'loading-spinner' }),
    SpinnerSize: { LG: 'lg' },
    StyledButtonColor: { STURDY_WHITE: 'sturdy-white' },
    StyledButtonWidth: { FULL: 'full', MIN: 'min' },
  };
});

jest.mock('@sumsub/websdk-react', () => () => null);

jest.mock('src/util/client-error', () => ({
  reportClientError: (...args: unknown[]) => mockReportClientError(...args),
}));

const mockAppHandling = { isInitialized: true, params: {}, setParams: jest.fn() };
jest.mock('src/contexts/app-handling.context', () => ({ useAppHandlingContext: () => mockAppHandling }));

jest.mock('src/contexts/layout.context', () => ({
  useLayoutContext: () => ({ rootRef: { current: null } }),
}));

jest.mock('src/hooks/app-params.hook', () => ({
  useAppParams: () => ({ lang: 'EN' }),
}));

const COUNTRY_CH = { id: 1, symbol: 'CH', name: 'Switzerland' };
const COUNTRY_DE = { id: 2, symbol: 'DE', name: 'Germany' };

const mockSettings = {
  translate: (_ns: string, text: string) => text,
  translateError: (key: string) => `error:${key}`,
  changeLanguage: jest.fn(),
  processingKycData: false,
  allowedCountries: [COUNTRY_CH, COUNTRY_DE],
  allowedOrganizationCountries: [COUNTRY_CH, COUNTRY_DE],
};

jest.mock('../contexts/settings.context', () => ({ useSettingsContext: () => mockSettings }));

jest.mock('../components/kyc-status', () => ({ KycStatusTable: () => null }));

jest.mock('../hooks/geo-location.hook', () => ({ useGeoLocation: () => ({ countryCode: 'CH' }) }));

jest.mock('../hooks/guard.hook', () => ({ useUserGuard: () => undefined }));

jest.mock('../hooks/kyc-helper.hook', () => ({
  useKycHelper: () => ({ nameToString: (n: string) => n, accountTypeToString: (t: string) => t }),
}));

jest.mock('../hooks/layout-config.hook', () => ({ useLayoutOptions: () => undefined }));

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), clearParams: jest.fn() };
jest.mock('../hooks/navigation.hook', () => ({ useNavigation: () => mockNavigation }));

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import KycScreen from '../screens/kyc.screen';

const CHARSET_ERROR = 'error:unsupported_characters';
const PROOF = new File(['%PDF'], 'proof.pdf', { type: 'application/pdf' });

function session(stepName: string) {
  return {
    kycLevel: 0,
    language: { symbol: 'EN' },
    kycClients: [],
    kycSteps: [],
    currentStep: { name: stepName, status: 'InProgress', session: { url: 'step-url', type: 'Browser' } },
  };
}

async function renderStep(stepName: string) {
  mockStartStep.mockResolvedValue(session(stepName));
  render(
    <MemoryRouter initialEntries={[`/kyc?code=kyc-code&step=${stepName}`]}>
      <Routes>
        <Route path="/kyc" element={<KycScreen />} />
      </Routes>
    </MemoryRouter>,
  );
  await waitFor(() => expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument());
  await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
}

async function type(name: string, value: string) {
  await act(async () => {
    fireEvent.change(screen.getByTestId(name), { target: { value } });
    fireEvent.blur(screen.getByTestId(name));
  });
}

async function pick(name: string, index: number) {
  const option = await screen.findByTestId(`${name}-option-${index}`);
  await act(async () => {
    fireEvent.click(option);
  });
}

async function next() {
  await waitFor(() => expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled());
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  });
}

async function fillAddress(prefix: string) {
  await type(`${prefix}.street`, 'Rue de l’Église');
  await type(`${prefix}.houseNumber`, '3‘a');
  await type(`${prefix}.zip`, '1000');
  await type(`${prefix}.city`, 'L’Abbaye');
}

const normalizedAddress = { street: "Rue de l'Église", houseNumber: "3'a", zip: '1000', city: "L'Abbaye" };

beforeEach(() => {
  jest.clearAllMocks();
  mockSetPersonalData.mockResolvedValue(undefined);
  mockSetBeneficialData.mockResolvedValue(undefined);
  mockSetAddressChangeData.mockResolvedValue(undefined);
  mockSetNameChangeData.mockResolvedValue(undefined);
});

describe('KycScreen personal data', () => {
  async function renderOrganization() {
    await renderStep('PersonalData');
    await pick('accountType', 1);
    await screen.findByTestId('organizationName');
  }

  it.each([
    'firstName',
    'lastName',
    'address.street',
    'address.houseNumber',
    'address.zip',
    'address.city',
    'organizationName',
    'organizationAddress.street',
    'organizationAddress.houseNumber',
    'organizationAddress.zip',
    'organizationAddress.city',
  ])('shows the character-set error on %s', async (name) => {
    await renderOrganization();

    await type(name, 'Łø');

    expect(await screen.findByText(CHARSET_ERROR)).toBeInTheDocument();
  });

  it.each(['address.zip', 'organizationAddress.zip'])('keeps the length cap on %s', async (name) => {
    await renderOrganization();

    await type(name, '12345678901');

    expect(await screen.findByText('error:pattern')).toBeInTheDocument();
    expect(screen.queryByText(CHARSET_ERROR)).not.toBeInTheDocument();
  });

  it('accepts typographic apostrophes and sends them normalized', async () => {
    await renderOrganization();

    await type('firstName', 'D’Arcy');
    await type('lastName', 'O’Brien');
    await fillAddress('address');
    await type('phone', '+41791234567');
    await type('organizationName', 'L’Atelier');
    await fillAddress('organizationAddress');
    await pick('organizationAddress.country', 0);

    expect(screen.queryByText(CHARSET_ERROR)).not.toBeInTheDocument();
    await next();

    expect(mockSetPersonalData).toHaveBeenCalledWith('kyc-code', 'step-url', {
      accountType: 'Organization',
      firstName: "D'Arcy",
      lastName: "O'Brien",
      phone: '+41791234567',
      address: { ...normalizedAddress, country: COUNTRY_CH },
      organizationName: "L'Atelier",
      organizationAddress: { ...normalizedAddress, country: COUNTRY_CH },
    });
  });

  it('shows the translated hint when the API rejects the characters', async () => {
    mockSetPersonalData.mockRejectedValue({
      message: 'address.street must only contain characters permitted in Swiss payment systems',
    });
    await renderStep('PersonalData');
    await pick('accountType', 0);

    await type('firstName', 'Anna');
    await type('lastName', 'Muster');
    await type('address.street', 'Bahnhofstrasse');
    await type('address.zip', '8001');
    await type('address.city', 'Zürich');
    await type('phone', '+41791234567');
    await next();

    expect(
      await screen.findByText(
        'Your name or address contains characters that our bank payments do not support. Please replace them with simple letters (e.g. l instead of ł) and try again.',
      ),
    ).toBeInTheDocument();
    expect(mockReportClientError.mock.calls[0][0]).toMatchObject({ name: 'KnownRejection' });
  });
});

describe('KycScreen beneficial owner', () => {
  async function toContactData(ownerCount: number) {
    await renderStep('BeneficialOwner');
    await pick('ownerCount', ownerCount);
    await next();
    await pick('isAccountHolderInvolved', 1);
    await next();
    await screen.findByTestId(`${ownerCount === 0 ? 'director' : 'owners.0'}.street`);
  }

  it.each(['street', 'houseNumber', 'zip', 'city'])('shows the character-set error on the %s', async (name) => {
    await toContactData(0);

    await type(`director.${name}`, 'Søren');

    expect(await screen.findByText(CHARSET_ERROR)).toBeInTheDocument();
  });

  it('does not check the contact person name, which the API accepts as is', async () => {
    await toContactData(0);

    await type('director.firstName', 'Łukasz');

    expect(screen.queryByText(CHARSET_ERROR)).not.toBeInTheDocument();
  });

  it('normalizes the managing director address', async () => {
    await toContactData(0);

    await type('director.firstName', 'Łukasz');
    await type('director.lastName', 'Nowak');
    await fillAddress('director');
    await pick('director.country', 1);
    await next();

    expect(mockSetBeneficialData).toHaveBeenCalledWith('kyc-code', 'step-url', {
      hasBeneficialOwners: false,
      isAccountHolderInvolved: false,
      beneficialOwners: undefined,
      managingDirector: { firstName: 'Łukasz', lastName: 'Nowak', ...normalizedAddress, country: COUNTRY_DE },
    });
  });

  it('normalizes the beneficial owner addresses', async () => {
    await toContactData(1);

    await type('owners.0.firstName', 'Anna');
    await type('owners.0.lastName', 'Muster');
    await fillAddress('owners.0');
    await pick('owners.0.country', 0);
    await next();

    expect(mockSetBeneficialData).toHaveBeenCalledWith('kyc-code', 'step-url', {
      hasBeneficialOwners: true,
      isAccountHolderInvolved: false,
      beneficialOwners: [{ firstName: 'Anna', lastName: 'Muster', ...normalizedAddress, country: COUNTRY_CH }],
      managingDirector: undefined,
    });
  });
});

describe('KycScreen address change', () => {
  it.each(['street', 'houseNumber', 'zip', 'city'])('shows the character-set error on the %s', async (name) => {
    await renderStep('AddressChange');

    await type(`address.${name}`, 'João');

    expect(await screen.findByText(CHARSET_ERROR)).toBeInTheDocument();
  });

  it('sends the address normalized', async () => {
    await renderStep('AddressChange');

    await fillAddress('address');
    await act(async () => {
      fireEvent.change(screen.getByTestId('file'), { target: { files: [PROOF] } });
    });
    await next();

    await waitFor(() => expect(mockSetAddressChangeData).toHaveBeenCalled());
    expect(mockSetAddressChangeData.mock.calls[0][2]).toMatchObject({
      fileName: 'proof.pdf',
      address: { ...normalizedAddress, country: COUNTRY_CH },
    });
  });
});

describe('KycScreen name change', () => {
  it.each(['firstName', 'lastName'])('shows the character-set error on the %s', async (name) => {
    await renderStep('NameChange');

    await type(name, 'Łukasz');

    expect(await screen.findByText(CHARSET_ERROR)).toBeInTheDocument();
  });

  it('sends the name normalized', async () => {
    await renderStep('NameChange');

    await type('firstName', 'D’Arcy');
    await type('lastName', 'O‘Brien');
    await act(async () => {
      fireEvent.change(screen.getByTestId('file'), { target: { files: [PROOF] } });
    });
    await next();

    await waitFor(() => expect(mockSetNameChangeData).toHaveBeenCalled());
    expect(mockSetNameChangeData.mock.calls[0][2]).toMatchObject({ firstName: "D'Arcy", lastName: "O'Brien" });
  });
});
