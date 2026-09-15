// Unit tests for the shared support info/chat building blocks: InfoPanel, InfoRow (with the
// non-selectable label), LinkedText and the read-only SupportMessageList.

jest.mock('src/hooks/support-dashboard.hook', () => ({
  CustomerAuthor: 'Customer',
}));

jest.mock('src/util/compliance-helpers', () => ({
  formatDateTime: (value: string) => `dt:${value}`,
}));

// The transfer action has its own tests; here only its placement in the thread matters.
jest.mock('src/components/support/kyc-file-transfer', () => ({
  KycFileTransfer: ({ message }: { message: { fileName?: string } }) => (
    <div data-testid="kyc-file-transfer">{message.fileName}</div>
  ),
}));

import { fireEvent, render, screen, within } from '@testing-library/react';
import { InfoPanel, InfoRow, LinkedText, SupportMessageList } from 'src/components/support/info-panel';

describe('InfoPanel / InfoRow', () => {
  it('renders the title and rows; labels cannot be selected, mono values select as a whole', () => {
    render(
      <InfoPanel title="Account Data">
        <InfoRow label="Name" value="Test User" />
        <InfoRow label="KYC Hash" value="abc" mono />
        <InfoRow label="Status" value={<span>Active</span>} />
      </InfoPanel>,
    );

    expect(screen.getByRole('heading', { name: 'Account Data' })).toBeInTheDocument();

    expect(screen.getByText('Name:').className).toContain('select-none');
    expect(screen.getByText('Test User').className).not.toContain('font-mono');
    expect(screen.getByText('Test User').className).not.toContain('select-all');
    expect(screen.getByText('abc').className).toContain('font-mono');
    expect(screen.getByText('abc').className).toContain('select-all');
    expect(screen.getByText('Active').closest('td')?.className).not.toContain('select-all');
  });
});

describe('LinkedText', () => {
  it('turns URLs into links and keeps the surrounding text', () => {
    render(<LinkedText text="Siehe https://app.dfx.swiss/tx/1 und fertig" />);

    const link = screen.getByRole('link', { name: 'https://app.dfx.swiss/tx/1' });
    expect(link).toHaveAttribute('href', 'https://app.dfx.swiss/tx/1');
    expect(link).toHaveAttribute('target', '_blank');
    expect(screen.getByText('Siehe')).toBeInTheDocument();
    expect(screen.getByText('und fertig')).toBeInTheDocument();
  });

  it('renders plain text without links unchanged', () => {
    render(<LinkedText text="nur Text" />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText('nur Text')).toBeInTheDocument();
  });
});

describe('SupportMessageList', () => {
  it('orders by id, styles customer and staff bubbles differently and shows a dash without text', () => {
    render(
      <SupportMessageList
        messages={[
          { id: 2, author: 'Jana', message: 'Antwort', created: '2026-09-02T10:00:00Z' },
          { id: 1, author: 'Customer', message: 'Frage', created: '2026-09-01T10:00:00Z' },
          { id: 3, author: 'Customer', created: '2026-09-03T10:00:00Z' },
        ]}
      />,
    );

    const bubbles = screen.getAllByText(/^(Frage|Antwort|-)$/).map((el) => el.textContent);
    expect(bubbles).toEqual(['Frage', 'Antwort', '-']);

    const customer = screen.getByText('Frage').closest('div.flex');
    const staff = screen.getByText('Antwort').closest('div.flex');
    expect(customer?.className).toContain('justify-start');
    expect(staff?.className).toContain('justify-end');
    expect(screen.getByText('dt:2026-09-01T10:00:00Z')).toBeInTheDocument();
  });

  it('falls back to the created timestamp when ids are absent', () => {
    render(
      <SupportMessageList
        messages={[
          { author: 'Customer', message: 'zweite', created: '2026-09-02T10:00:00Z' },
          { author: 'Customer', message: 'erste', created: '2026-09-01T10:00:00Z' },
        ]}
      />,
    );

    expect(screen.getAllByText(/^(erste|zweite)$/).map((el) => el.textContent)).toEqual(['erste', 'zweite']);
  });

  it('renders file links only with an onOpenFile handler and stops the click from bubbling', () => {
    const onOpenFile = jest.fn();
    const onRowClick = jest.fn();
    const withFile = { id: 1, author: 'Customer', message: 'Anhang', fileName: 'ausweis.pdf', created: '2026-09-01' };

    const { rerender } = render(
      <div onClick={onRowClick}>
        <SupportMessageList messages={[withFile]} onOpenFile={onOpenFile} />
      </div>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'ausweis.pdf' }));
    expect(onOpenFile).toHaveBeenCalledWith(withFile);
    expect(onRowClick).not.toHaveBeenCalled();

    rerender(
      <div onClick={onRowClick}>
        <SupportMessageList messages={[withFile]} />
      </div>,
    );
    expect(screen.queryByRole('button', { name: 'ausweis.pdf' })).not.toBeInTheDocument();
    expect(
      within(screen.getByText('Anhang').closest('div.flex') as HTMLElement).getByText('Customer'),
    ).toBeInTheDocument();
  });

  it('offers the KYC file transfer only next to a file link, and only with an onOpenFile handler', () => {
    const withFile = { id: 1, author: 'Customer', fileName: 'ausweis.pdf', created: '2026-09-01' };
    const withoutFile = { id: 2, author: 'Customer', message: 'Text', created: '2026-09-02' };

    const { rerender } = render(<SupportMessageList messages={[withFile, withoutFile]} onOpenFile={jest.fn()} />);
    expect(screen.getAllByTestId('kyc-file-transfer').map((el) => el.textContent)).toEqual(['ausweis.pdf']);

    rerender(<SupportMessageList messages={[withFile, withoutFile]} />);
    expect(screen.queryByTestId('kyc-file-transfer')).not.toBeInTheDocument();
  });
});
