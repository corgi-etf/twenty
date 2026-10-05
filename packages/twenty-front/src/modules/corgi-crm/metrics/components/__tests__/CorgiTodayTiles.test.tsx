import { useCorgiHome } from '@/corgi-crm/home/components/CorgiHomeProvider';
import { corgiHomeFixture } from '@/corgi-crm/home/testing/corgiHomeFixture';
import { CorgiTodayTiles } from '@/corgi-crm/metrics/components/CorgiTodayTiles';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';

jest.mock('@/corgi-crm/home/components/CorgiHomeProvider', () => ({
  useCorgiHome: jest.fn(),
}));

const Location = () => (
  <output aria-label="Current location">{useLocation().search}</output>
);
const setup = () => {
  const summary = corgiHomeFixture();
  jest.mocked(useCorgiHome).mockReturnValue({
    summary,
    enabled: true,
    loading: false,
    refresh: jest.fn(),
    revision: 0,
  });
  return summary;
};
const renderTiles = () =>
  render(
    <I18nProvider i18n={i18n}>
      <MemoryRouter
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <CorgiTodayTiles />
        <Location />
      </MemoryRouter>
    </I18nProvider>,
  );

describe('Today tiles', () => {
  it('shows all five exact server totals, keeps currencies separate, and opens the allocated-company drilldown', async () => {
    setup();
    renderTiles();
    expect(screen.getAllByRole('link')).toHaveLength(5);
    expect(
      screen.getByRole('link', { name: /Activities today/ }),
    ).toHaveTextContent('124');
    expect(
      screen.getByRole('link', { name: /Allocation amount/ }),
    ).toHaveTextContent('$2,500.00 · €1,000.00');
    await userEvent.click(
      screen.getByRole('link', { name: /Current clients/ }),
    );
    expect(screen.getByLabelText('Current location')).toHaveTextContent(
      '?section=currentClients',
    );
  });
  it('renders denied and unavailable metrics explicitly without fabricating zero counts', () => {
    const summary = setup();
    summary.today.metrics.activities = { status: 'denied', count: null };
    summary.today.metrics.meetingsSet = { status: 'unavailable', count: null };
    renderTiles();
    expect(
      screen.getByRole('link', { name: /Activities today/ }),
    ).toHaveTextContent('No access');
    expect(
      screen.getByRole('link', { name: /Meetings set today/ }),
    ).toHaveTextContent('Unavailable');
    expect(
      screen.getByRole('link', { name: /Activities today/ }),
    ).toHaveAttribute('aria-disabled', 'true');
  });
});
