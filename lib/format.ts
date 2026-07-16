export const pct = (value: number) => `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
export const multiple = (value: number | null) => value === null ? "N/A" : `${value.toFixed(1)}배`;
