import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Shell } from "@/components/Shell";
import { ToastProvider } from "@/components/Toast";
import { WORKSPACE_COOKIE, WORKSPACE_NAME_COOKIE, isWorkspaceId } from "@/lib/server";
import { getCaller } from "@/lib/session";

/** Every signed-in page: the sidebar around it, toasts above it. A session the API no longer
 * accepts goes back to sign-in. */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const caller = await getCaller();
  if (!caller) redirect("/login");
  const jar = await cookies();
  const id = jar.get(WORKSPACE_COOKIE)?.value;
  const viewing = caller.platform_admin && isWorkspaceId(id) ? { id, name: decodeURIComponent(jar.get(WORKSPACE_NAME_COOKIE)?.value ?? "") } : null;
  return (
    <ToastProvider>
      <Shell caller={caller} viewing={viewing}>
        {children}
      </Shell>
    </ToastProvider>
  );
}
