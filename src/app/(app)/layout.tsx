import { redirect } from "next/navigation";
import { Shell } from "@/components/Shell";
import { ToastProvider } from "@/components/Toast";
import { getCaller } from "@/lib/session";

/** Every signed-in page: the sidebar around it, toasts above it. A session the API no longer
 * accepts goes back to sign-in. */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const caller = await getCaller();
  if (!caller) redirect("/login");
  return (
    <ToastProvider>
      <Shell caller={caller}>{children}</Shell>
    </ToastProvider>
  );
}
