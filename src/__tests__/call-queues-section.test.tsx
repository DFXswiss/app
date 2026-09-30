// Component tests for the dashboard's call-queue section: only non-empty queues, summed in the
// header, named by callQueueLabel, one click opens the queue.

const mockNavigate = jest.fn();

jest.mock('@dfx.swiss/react', () => ({
  CallQueue: {
    MANUAL_CHECK_PHONE: 'ManualCheckPhone',
    MANUAL_CHECK_IP_PHONE: 'ManualCheckIpPhone',
    MANUAL_CHECK_IP_COUNTRY_PHONE: 'ManualCheckIpCountryPhone',
    MANUAL_CHECK_EXTERNAL_ACCOUNT_PHONE: 'ManualCheckExternalAccountPhone',
    UNAVAILABLE_SUSPICIOUS: 'UnavailableSuspicious',
  },
  AmlReason: {
    MANUAL_CHECK_PHONE: 'ManualCheckPhone',
    MANUAL_CHECK_PHONE_FAILED: 'ManualCheckPhoneFailed',
    MANUAL_CHECK_IP_PHONE: 'ManualCheckIpPhone',
    MANUAL_CHECK_IP_COUNTRY_PHONE: 'ManualCheckIpCountryPhone',
    MANUAL_CHECK_EXTERNAL_ACCOUNT_PHONE: 'ManualCheckExternalAccountPhone',
  },
  CheckStatus: { PENDING: 'Pending', FAIL: 'Fail', PASS: 'Pass' },
}));

jest.mock('src/contexts/settings.context', () => ({
  useSettingsContext: () => ({ translate: (_ns: string, key: string) => key }),
}));

jest.mock('src/hooks/navigation.hook', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));

jest.mock('src/components/compliance/collapsible-section', () => ({
  CollapsibleSection: ({ title, count, children }: any) => (
    <section>
      <h2>
        {title} ({count})
      </h2>
      {children}
    </section>
  ),
}));

import { fireEvent, render, screen } from '@testing-library/react';
import { CallQueuesSection } from 'src/components/compliance/call-queues-section';

describe('CallQueuesSection', () => {
  beforeEach(() => mockNavigate.mockReset());

  it('renders nothing when every queue is empty', () => {
    const { container } = render(<CallQueuesSection entries={[{ queue: 'ManualCheckPhone', count: 0 } as any]} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('lists the non-empty queues by label with the summed count and opens one by its key', () => {
    render(
      <CallQueuesSection
        entries={[
          { queue: 'UnavailableSuspicious', count: 3 } as any,
          { queue: 'ManualCheckIpPhone', count: 0 } as any,
          { queue: 'ManualCheckPhone', count: 4 } as any,
        ]}
      />,
    );

    expect(screen.getByRole('heading')).toHaveTextContent('Call Queues (7)');
    expect(screen.getByText('Callback')).toBeInTheDocument();
    expect(screen.getByText('ManualCheckPhone')).toBeInTheDocument();
    expect(screen.queryByText('ManualCheckIpPhone')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Callback'));
    expect(mockNavigate).toHaveBeenCalledWith('compliance/call-queues/UnavailableSuspicious');
  });
});
