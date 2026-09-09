import { render, screen } from '@testing-library/react';
import { type ReactNode } from 'react';

import { ModalStatefulWrapper } from '@/ui/layout/modal/components/ModalStatefulWrapper';

jest.mock(
  '@/ui/layout/hooks/useWorkspaceSurfaceScopedComponentInstanceId',
  () => ({
    useWorkspaceSurfaceScopedComponentInstanceId: (id: string) => id,
  }),
);

jest.mock('@/ui/utilities/responsive/hooks/useIsMobile', () => ({
  useIsMobile: () => false,
}));

jest.mock('@/ui/layout/modal/contexts/ModalContainerContext', () => ({
  useModalContainer: () => ({ container: undefined }),
}));

jest.mock(
  '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue',
  () => ({
    useAtomComponentStateValue: () => true,
  }),
);

jest.mock('@/ui/layout/modal/hooks/useModal', () => ({
  useModal: () => ({ closeModal: jest.fn() }),
}));

jest.mock(
  '@/ui/layout/modal/components/ModalHotkeysAndClickOutsideEffect',
  () => ({
    ModalHotkeysAndClickOutsideEffect: () => null,
  }),
);

jest.mock('twenty-ui/surfaces', () => ({
  Modal: ({
    ariaLabel,
    children,
  }: {
    ariaLabel?: string;
    children: ReactNode;
  }) => (
    <div role="dialog" aria-label={ariaLabel}>
      {children}
    </div>
  ),
}));

describe('ModalStatefulWrapper', () => {
  it('forwards its accessible label to the rendered dialog', () => {
    render(
      <ModalStatefulWrapper
        modalInstanceId="labelled-modal"
        ariaLabel="Labelled modal"
      >
        Modal content
      </ModalStatefulWrapper>,
    );

    expect(
      screen.getByRole('dialog', { name: 'Labelled modal' }),
    ).toHaveTextContent('Modal content');
  });
});
