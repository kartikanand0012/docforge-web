/** The public demo's shared account (the backend's `docforge.demo seed`): its PIN is public by
 * design, and it is shown on the sign-in page only where the deployment sets DOCFORGE_DEMO_PIN. */

export type DemoAccount = { organisation: string; email: string; pin: string };

export function demoAccount(env: Record<string, string | undefined> = process.env): DemoAccount | null {
  const pin = env.DOCFORGE_DEMO_PIN?.trim();
  if (!pin) return null;
  return {
    organisation: env.DOCFORGE_DEMO_TENANT?.trim() || "demo",
    email: env.DOCFORGE_DEMO_EMAIL?.trim() || "demo@docforge.example",
    pin,
  };
}
