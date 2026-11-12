import { RequestStateContent } from 'src/front-components/thirteen-f-workspace/request-state';
import { UnifiedSearchResults } from 'src/front-components/thirteen-f-workspace/search-results';
import type { ThirteenFWorkspaceController } from 'src/front-components/thirteen-f-workspace/workspace-controller';
import { WORKSPACE_STYLES } from 'src/front-components/thirteen-f-workspace/workspace-styles';
import {
  FirmDirectory,
  FirmHoldings,
  SecurityHolders,
} from 'src/front-components/thirteen-f-workspace/views';

type WorkspaceContentProps = { controller: ThirteenFWorkspaceController };

const NoPeriod = ({ subject }: { subject: 'firm' | 'security' }) => (
  <div style={WORKSPACE_STYLES.status} role="status">
    No SEC report period is available for this {subject}.
  </div>
);

export const WorkspaceContent = ({ controller }: WorkspaceContentProps) => {
  if (controller.periodCatalogState.status !== 'success') {
    return (
      <RequestStateContent
        state={controller.periodCatalogState}
        loadingLabel="Loading 13F report periods…"
      >
        {() => null}
      </RequestStateContent>
    );
  }
  const selectedPeriod = controller.selectedPeriod;
  if (controller.selectedFirmId) {
    if (!selectedPeriod) return <NoPeriod subject="firm" />;
    if (controller.firmState.status === 'error') {
      return (
        <RequestStateContent
          state={controller.firmState}
          loadingLabel="Loading firm details…"
        >
          {() => null}
        </RequestStateContent>
      );
    }
    if (controller.firmHoldingsState.status === 'error') {
      return (
        <RequestStateContent
          state={controller.firmHoldingsState}
          loadingLabel="Loading firm holdings…"
        >
          {() => null}
        </RequestStateContent>
      );
    }
    if (controller.firmState.status !== 'success') {
      return (
        <RequestStateContent
          state={controller.firmState}
          loadingLabel="Loading firm details…"
        >
          {() => null}
        </RequestStateContent>
      );
    }
    const firm = controller.firmState.data;
    return (
      <RequestStateContent
        state={controller.firmHoldingsState}
        loadingLabel="Loading firm holdings…"
      >
        {({ page }) => (
          <FirmHoldings
            firm={firm}
            holdings={page.items}
            totalCount={page.totalCount}
            totalReportedValue={page.totalReportedValue}
            asOfDate={selectedPeriod.asOfDate}
            dateBasis={selectedPeriod.dateBasis}
            order={controller.holdingsOrder}
            onBack={controller.backToDirectory}
            onSelectSecurity={controller.chooseSecurity}
            onOrderChange={controller.handleHoldingsOrderChange}
          />
        )}
      </RequestStateContent>
    );
  }
  const selectedSecurity = controller.selectedSecurity;
  if (selectedSecurity) {
    if (!selectedPeriod) return <NoPeriod subject="security" />;
    return (
      <RequestStateContent
        state={controller.securityHoldingsState}
        loadingLabel="Loading security holders…"
      >
        {({ page }) => (
          <SecurityHolders
            security={selectedSecurity}
            holdings={page.items}
            totalCount={page.totalCount}
            onBack={controller.backToDirectory}
            onSelectFirm={controller.chooseFirm}
          />
        )}
      </RequestStateContent>
    );
  }
  return (
    <RequestStateContent
      state={controller.directoryState}
      loadingLabel="Loading 13F data…"
    >
      {(result) =>
        result.kind === 'search' ? (
          <UnifiedSearchResults
            results={result.results}
            onSelectFirm={controller.chooseFirm}
            onSelectSecurity={controller.chooseSecurity}
          />
        ) : (
          <FirmDirectory
            firms={result.page.items}
            totalCount={result.page.totalCount}
            onSelect={controller.chooseFirm}
          />
        )
      }
    </RequestStateContent>
  );
};
