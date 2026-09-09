import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';
import { H1Title, H1TitleFontColor } from 'twenty-ui/typography';

import { QuickLogCompanyActivityForm } from '@/activities/quick-log/components/QuickLogCompanyActivityForm';
import { ModalStatefulWrapper } from '@/ui/layout/modal/components/ModalStatefulWrapper';
import { useModal } from '@/ui/layout/modal/hooks/useModal';

type QuickLogCompanyActivityModalProps = {
  companyId: string;
  modalInstanceId: string;
};

const StyledTitle = styled.div`
  text-align: center;
`;

export const QuickLogCompanyActivityModal = ({
  companyId,
  modalInstanceId,
}: QuickLogCompanyActivityModalProps) => {
  const { t } = useLingui();
  const { closeModal } = useModal();
  const [formVersion, setFormVersion] = useState(0);

  const handleClose = () => {
    setFormVersion((version) => version + 1);
    closeModal(modalInstanceId);
  };

  return (
    <ModalStatefulWrapper
      modalInstanceId={modalInstanceId}
      onClose={handleClose}
      isClosable
      size="medium"
      padding="large"
      overlay="dark"
      width="420px"
      renderInDocumentBody
      smallBorderRadius
      autoHeight
    >
      <StyledTitle>
        <H1Title
          title={t`Log follow-up`}
          fontColor={H1TitleFontColor.Primary}
        />
      </StyledTitle>
      <QuickLogCompanyActivityForm
        key={formVersion}
        companyId={companyId}
        instanceId={modalInstanceId}
        onCancel={handleClose}
        onLogged={handleClose}
      />
    </ModalStatefulWrapper>
  );
};
