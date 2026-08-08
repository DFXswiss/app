// The panel pulls the suggestion type from the dashboard hook, which reaches the SDK at import time.
// Same stub as the other support hook tests, so the component renders without the app shell.
jest.mock('@dfx.swiss/react', () => ({
  useApi: () => ({ call: jest.fn() }),
  Department: { SUPPORT: 'Support', COMPLIANCE: 'Compliance', MARKETING: 'Marketing' },
  TfaLevel: { STRICT: 'Strict' },
}));

jest.mock('src/hooks/navigation.hook', () => ({
  useNavigation: () => ({ navigate: jest.fn() }),
}));

import { fireEvent, render, screen } from '@testing-library/react';
import { ReplySuggestionPanel } from 'src/components/support/reply-suggestion-panel';
import { SupportReplySuggestion } from 'src/hooks/support-dashboard.hook';

// The panel is the whole surface a suggestion has in the support tool: it shows the proposed answer,
// warns when the conversation has moved past it, and offers exactly two decisions. It never offers a
// way to write one — suggestions enter through the API only.
const suggestion = (values: Partial<SupportReplySuggestion> = {}): SupportReplySuggestion => ({
  id: 3,
  text: 'The transfer arrived, please check again.',
  state: 'Pending',
  messageId: 100,
  isStale: false,
  created: '2026-08-08T10:00:00.000Z',
  ...values,
});

describe('ReplySuggestionPanel', () => {
  it('shows the proposed answer', () => {
    render(
      <ReplySuggestionPanel suggestion={suggestion()} isBusy={false} onAccept={jest.fn()} onDiscard={jest.fn()} />,
    );

    expect(screen.getByText('Suggested reply')).toBeInTheDocument();
    expect(screen.getByText('The transfer arrived, please check again.')).toBeInTheDocument();
  });

  it('renders links in the proposed answer', () => {
    render(
      <ReplySuggestionPanel
        suggestion={suggestion({ text: 'See https://dfx.swiss/faq' })}
        isBusy={false}
        onAccept={jest.fn()}
        onDiscard={jest.fn()}
      />,
    );

    expect(screen.getByRole('link', { name: 'https://dfx.swiss/faq' })).toHaveAttribute(
      'href',
      'https://dfx.swiss/faq',
    );
  });

  it('warns when the conversation has moved past the suggestion', () => {
    render(
      <ReplySuggestionPanel
        suggestion={suggestion({ isStale: true })}
        isBusy={false}
        onAccept={jest.fn()}
        onDiscard={jest.fn()}
      />,
    );

    expect(screen.getByText(/Written before the newest message/)).toBeInTheDocument();
  });

  it('stays silent when the suggestion answers the newest message', () => {
    render(
      <ReplySuggestionPanel suggestion={suggestion()} isBusy={false} onAccept={jest.fn()} onDiscard={jest.fn()} />,
    );

    expect(screen.queryByText(/Written before the newest message/)).not.toBeInTheDocument();
  });

  it('reports the decision', () => {
    const onAccept = jest.fn();
    const onDiscard = jest.fn();
    render(
      <ReplySuggestionPanel suggestion={suggestion()} isBusy={false} onAccept={onAccept} onDiscard={onDiscard} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));

    expect(onAccept).toHaveBeenCalledTimes(1);
    expect(onDiscard).toHaveBeenCalledTimes(1);
  });

  it('blocks both decisions while one is in flight', () => {
    render(<ReplySuggestionPanel suggestion={suggestion()} isBusy onAccept={jest.fn()} onDiscard={jest.fn()} />);

    expect(screen.getByRole('button', { name: 'Accept' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Discard' })).toBeDisabled();
  });
});
