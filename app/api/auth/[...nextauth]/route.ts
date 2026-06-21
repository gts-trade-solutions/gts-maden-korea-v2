import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth/authOptions";

// NextAuth catch-all. Coexists with the existing specific /api/auth/* routes
// (those are more specific and take precedence) during the strangler cutover.
const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
