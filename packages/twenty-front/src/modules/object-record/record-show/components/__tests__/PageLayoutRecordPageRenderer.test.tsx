import { render, screen, within } from '@testing-library/react';
import { PageLayoutRecordPageRenderer } from '@/object-record/record-show/components/PageLayoutRecordPageRenderer';
let mockSidePanel = false;
jest.mock('@/ui/layout/hooks/useWorkspaceSurface', () => ({
  useWorkspaceSurface: () => ({ type: mockSidePanel ? 'side-panel' : 'main' }),
}));
jest.mock('@/page-layout/hooks/usePageLayoutIdForRecord', () => ({
  usePageLayoutIdForRecord: () => ({ pageLayoutId: 'layout' }),
}));
jest.mock(
  '@/ui/utilities/state/jotai/hooks/useAtomFamilySelectorValue',
  () => ({ useAtomFamilySelectorValue: () => null }),
);
jest.mock(
  '@/object-record/record-show/components/RecordShowContainerContextStoreTargetedRecordsEffect',
  () => ({ RecordShowContainerContextStoreTargetedRecordsEffect: () => null }),
);
jest.mock('@/page-layout/components/PageLayoutRenderer', () => ({
  PageLayoutRenderer: () => <div>Native notes and fields</div>,
}));
jest.mock('@/ui/layout/side-panel/components/SidePanelFooter', () => ({
  SidePanelFooter: () => <footer>Side panel actions</footer>,
}));
it('keeps the overview and native notes inside the same scrolling region', () => {
  mockSidePanel = false;
  const { container } = render(
    <PageLayoutRecordPageRenderer
      targetRecordIdentifier={{
        id: 'company',
        targetObjectNameSingular: 'company',
      }}
      leadingContent={<section>Expanded profile</section>}
    />,
  );
  const scroll = container.querySelector(
    '[data-record-show-scroll-container]',
  )!;
  expect(
    within(scroll as HTMLElement).getByText('Expanded profile'),
  ).toBeInTheDocument();
  expect(
    within(scroll as HTMLElement).getByText('Native notes and fields'),
  ).toBeInTheDocument();
});
it('preserves the compact side panel and its footer', () => {
  mockSidePanel = true;
  render(
    <PageLayoutRecordPageRenderer
      targetRecordIdentifier={{
        id: 'company',
        targetObjectNameSingular: 'company',
      }}
      leadingContent={<section>Expanded profile</section>}
    />,
  );
  expect(screen.queryByText('Expanded profile')).not.toBeInTheDocument();
  expect(screen.getByText('Native notes and fields')).toBeInTheDocument();
  expect(screen.getByText('Side panel actions')).toBeInTheDocument();
});
