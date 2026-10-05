import { type ObjectRecord } from '@/object-record/types/ObjectRecord';
import { createAtomState } from '@/ui/utilities/state/jotai/utils/createAtomState';

export type CorgiCreateDialog = {
  id: string;
  objectNameSingular: string;
  initialValues?: Partial<ObjectRecord>;
  draft?: Partial<ObjectRecord>;
  owners?: ObjectRecord[];
  relations?: Record<string, ObjectRecord | undefined>;
  savedRecord?: ObjectRecord;
  onCreated?: (record: ObjectRecord) => void | Promise<void>;
  resolve: (record: ObjectRecord | undefined) => void;
  trigger: HTMLElement | null;
};

export const corgiCreateDialogsState = createAtomState<CorgiCreateDialog[]>({
  key: 'corgiCreateDialogsState',
  defaultValue: [],
});
