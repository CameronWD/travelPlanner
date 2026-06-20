import { redirect } from "next/navigation";

/**
 * The root "/" redirects to "/trips". The (app) layout will bounce
 * unauthenticated visitors to /signin.
 */
export default function RootPage() {
  redirect("/trips");
}
