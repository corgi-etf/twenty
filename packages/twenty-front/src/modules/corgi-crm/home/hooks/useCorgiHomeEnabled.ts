import { useObjectMetadataItems } from '@/object-metadata/hooks/useObjectMetadataItems';

export const useCorgiHomeEnabled = () => {
  const { objectMetadataItems } = useObjectMetadataItems();
  return ['outreachActivity', 'meetingBooking', 'companyAllocation'].every(
    (name) =>
      objectMetadataItems.some(
        (object) =>
          object.nameSingular === name &&
          object.isActive &&
          (name !== 'companyAllocation' ||
            object.fields.some((field) => field.name === 'loggedAt')),
      ),
  );
};
