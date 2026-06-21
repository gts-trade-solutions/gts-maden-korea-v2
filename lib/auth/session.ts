import "server-only";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/authOptions";

// Server-side helper to read the current NextAuth user in route handlers /
// server components. This is what API routes will use instead of the old
// supabaseRoute().auth.getUser() during the auth cutover.
export type SessionUser = {
  id: string;
  email: string | null;
  name: string | null;
  role: string | null;
};

export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await getServerSession(authOptions);
  const id = (session?.user as any)?.id as string | undefined;
  if (!id) return null;
  return {
    id,
    email: session?.user?.email ?? null,
    name: session?.user?.name ?? null,
    role: (session?.user as any)?.role ?? null,
  };
}

export async function getSessionUserId(): Promise<string | null> {
  return (await getSessionUser())?.id ?? null;
}
