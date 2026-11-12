import { formatDate } from 'src/front-components/thirteen-f-workspace/format';
import { PeriodSelect } from 'src/front-components/thirteen-f-workspace/period-select';
import type { ThirteenFWorkspaceController } from 'src/front-components/thirteen-f-workspace/workspace-controller';
import { WORKSPACE_STYLES } from 'src/front-components/thirteen-f-workspace/workspace-styles';

type WorkspaceHeaderProps = {
  controller: Pick<
    ThirteenFWorkspaceController,
    | 'query'
    | 'asOfDate'
    | 'availablePeriods'
    | 'selectedPeriod'
    | 'handleQueryChange'
    | 'handlePeriodChange'
  >;
};

export const WorkspaceHeader = ({ controller }: WorkspaceHeaderProps) => (
  <header style={WORKSPACE_STYLES.header}>
    <div style={WORKSPACE_STYLES.titleRow}>
      <div>
        <h1 style={WORKSPACE_STYLES.title}>13F</h1>
        <div style={WORKSPACE_STYLES.subtitle}>
          Review firms and find every firm holding a security.
        </div>
      </div>
      {controller.asOfDate ? (
        <div style={WORKSPACE_STYLES.subtitle}>
          SEC report period {formatDate(controller.asOfDate)}
        </div>
      ) : null}
    </div>
    <div style={WORKSPACE_STYLES.controls}>
      <input
        type="search"
        style={WORKSPACE_STYLES.input}
        value={controller.query}
        placeholder="Search firm, ticker, issuer, CUSIP, or CIK"
        aria-label="Search 13F data"
        onChange={(event) => controller.handleQueryChange(event.target.value)}
      />
      <PeriodSelect
        periods={controller.availablePeriods}
        selectedPeriod={controller.selectedPeriod}
        fallbackAsOfDate={controller.asOfDate}
        onChange={controller.handlePeriodChange}
      />
    </div>
  </header>
);
