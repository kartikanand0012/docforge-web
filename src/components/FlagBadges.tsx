import { AlertTriangle, Copy, Info } from "lucide-react";
import { StatusBadge } from "@/components/ui";
import { queueBadges, type QueueFlags } from "@/lib/flags";

const ICONS = { fail: Copy, warn: AlertTriangle, info: Info };

/** A queue row's flags as badges, each in words; nothing when none was raised. */
export function QueueFlagBadges({ flags }: { flags: Partial<QueueFlags> | null | undefined }) {
  const badges = queueBadges(flags);
  if (!badges.length) return null;
  return (
    <ul className="flag-badges" aria-label="Flags on this bill">
      {badges.map((badge) => (
        <li key={badge.text}>
          <StatusBadge kind={badge.kind} icon={ICONS[badge.kind]}>
            {badge.text}
          </StatusBadge>
        </li>
      ))}
    </ul>
  );
}
