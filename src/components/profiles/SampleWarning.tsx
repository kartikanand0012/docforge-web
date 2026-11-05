import { StatusBadge } from "@/components/ui";
import { SAMPLE_WARNING } from "@/lib/profiles";

/** The made-up SAMPLE layout in use: said wherever it is. */
export function SampleWarning() {
  return <StatusBadge kind="warn">{SAMPLE_WARNING}</StatusBadge>;
}
