// The presentational building blocks shared by the DFX support screen and the read-only RealUnit
// dossier. What matters here is what each of them renders for the reduced data the dossier passes:
// messages without an id, without a file, and a thread rendered without a file handler at all.

jest.mock('@dfx.swiss/react', () => ({
  useApi: () => ({ call: jest.fn() }),
  Department: { SUPPORT: 'Support', COMPLIANCE: 'Compliance', MARKETING: 'Marketing' },
  TfaLevel: { STRICT: 'Strict' },
}));

jest.mock('src/hooks/navigation.hook', () => ({
  useNavigation: () => ({ navigate: jest.fn() }),
}));

import { fireEvent, render, screen, within } from '@testing-library/react';
import {
  InfoPanel,
  InfoRow,
  LinkedText,
  SupportMessageList,
  SupportMessageListItem,
} from 'src/components/support/info-panel';

const message = (values: Partial<SupportMessageListItem> = {}): SupportMessageListItem => ({
  author: 'Customer',
  message: 'Hello',
  created: '2026-08-01T09:00:00.000Z',
  ...values,
});

describe('InfoPanel', () => {
  it('renders its rows under a title', () => {
    render(
      <InfoPanel title="Issue Details">
        <InfoRow label="UID" value="issue-uid" mono />
        <InfoRow label="Name" value={<span>Max</span>} />
      </InfoPanel>,
    );

    expect(screen.getByText('Issue Details')).toBeInTheDocument();
    expect(screen.getByText('UID:')).toBeInTheDocument();
    expect(screen.getByText('issue-uid')).toHaveClass('font-mono');
    expect(screen.getByText('Max')).toBeInTheDocument();
  });

  it('renders a plain row without the monospace hint', () => {
    render(
      <InfoPanel title="Account Data">
        <InfoRow label="Status" value="Active" />
      </InfoPanel>,
    );

    expect(screen.getByText('Active')).not.toHaveClass('font-mono');
  });
});

describe('LinkedText', () => {
  it('turns a URL into a link and leaves the rest as text', () => {
    render(<LinkedText text="See https://dfx.swiss/faq for details" />);

    expect(screen.getByRole('link', { name: 'https://dfx.swiss/faq' })).toHaveAttribute(
      'href',
      'https://dfx.swiss/faq',
    );
    expect(screen.getByText(/for details/)).toBeInTheDocument();
  });

  it('renders text without a URL unchanged', () => {
    render(<LinkedText text="no link here" />);

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText('no link here')).toBeInTheDocument();
  });
});

describe('SupportMessageList', () => {
  it('orders the thread by message id', () => {
    render(
      <SupportMessageList
        messages={[
          message({ id: 2, message: 'second' }),
          message({ id: 1, message: 'first' }),
          message({ id: 3, message: 'third' }),
        ]}
      />,
    );

    expect(screen.getAllByText(/first|second|third/).map((e) => e.textContent)).toEqual([
      'first',
      'second',
      'third',
    ]);
  });

  it('falls back to the timestamp when the messages carry no id', () => {
    render(
      <SupportMessageList
        messages={[
          message({ message: 'later', created: '2026-08-01T10:00:00.000Z' }),
          message({ message: 'earlier', created: '2026-08-01T09:00:00.000Z' }),
        ]}
      />,
    );

    expect(screen.getAllByText(/later|earlier/).map((e) => e.textContent)).toEqual(['earlier', 'later']);
  });

  it('separates what the customer wrote from what support answered', () => {
    render(
      <SupportMessageList
        messages={[
          message({ id: 1, message: 'from the customer' }),
          message({ id: 2, author: 'Alex', message: 'from support' }),
        ]}
      />,
    );

    expect(screen.getByText('from the customer').closest('div.flex')).toHaveClass('justify-start');
    expect(screen.getByText('from support').closest('div.flex')).toHaveClass('justify-end');
  });

  it('renders a placeholder for a message that carries only a file', () => {
    render(<SupportMessageList messages={[message({ id: 1, message: undefined, fileName: 'receipt.pdf' })]} />);

    expect(screen.getByText('-')).toBeInTheDocument();
  });

  it('offers the file of a message to the handler, with its name settled', () => {
    const onOpenFile = jest.fn();
    render(
      <SupportMessageList
        messages={[message({ id: 1, fileName: 'receipt.pdf' })]}
        onOpenFile={onOpenFile}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'receipt.pdf' }));

    expect(onOpenFile).toHaveBeenCalledWith(expect.objectContaining({ id: 1, fileName: 'receipt.pdf' }));
  });

  it('renders no file link in a thread without a file handler', () => {
    render(<SupportMessageList messages={[message({ id: 1, fileName: 'receipt.pdf' })]} />);

    expect(screen.queryByRole('button', { name: 'receipt.pdf' })).not.toBeInTheDocument();
  });

  it('renders no file link for a message without a file', () => {
    render(<SupportMessageList messages={[message({ id: 1 })]} onOpenFile={jest.fn()} />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('links a URL inside a message', () => {
    const { container } = render(<SupportMessageList messages={[message({ id: 1, message: 'see https://dfx.swiss' })]} />);

    expect(within(container).getByRole('link', { name: 'https://dfx.swiss' })).toBeInTheDocument();
  });
});
