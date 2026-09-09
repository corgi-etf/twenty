export const normalizeWholesalerMapFilterValue = (
  value: string | null | undefined,
) => value?.trim().toLocaleUpperCase('en-US') ?? '';

export const formatWholesalerMapLocationOption = (
  value: string | null | undefined,
) => {
  const trimmedValue = value?.trim() ?? '';

  return trimmedValue.length <= 3
    ? normalizeWholesalerMapFilterValue(trimmedValue)
    : trimmedValue;
};
