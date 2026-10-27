import { ProfileClient } from "./profile-client";

// Server component wrapper — `force-dynamic` prevents SSG prerendering
// of this page (which would fail because useSession() returns undefined
// during static generation without a SessionProvider context).
export const dynamic = "force-dynamic";

export default function ProfilePage() {
  return <ProfileClient />;
}
