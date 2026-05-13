import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { LoginPage } from "./_components/login-page";
import { auth } from "~/server/auth";
import { db } from "~/server/clients/db";
import { env } from "~/env";
import { ErrorDisplay } from "~/components/core/error-display";

export default async function Page() {
  let session;
  try {
    session = await auth.api.getSession({ headers: await headers() });
  } catch {
    return (
      <ErrorDisplay
        message="We're having trouble reaching our servers. Please check your connection and try again."
        retryText="Refresh Page"
        onRetry="refresh"
      />
    );
  }

  if (session) {
    redirect("/dashboard");
  }

  let firstTime = false;
  try {
    const userCount = await db.user.count();
    firstTime = userCount === 0;
  } catch {
    // Non-fatal: if we can't count users, default to login tab.
  }

  const signupEnabled = firstTime || env.ALLOW_SIGNUPS;

  return <LoginPage firstTime={firstTime} signupEnabled={signupEnabled} />;
}
