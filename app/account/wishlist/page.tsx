// Wishlist moved to the top-level /wishlist URL so anonymous users can
// view their list (the previous /account/wishlist path force-redirected
// to login). This file remains only as a permanent redirect so existing
// bookmarks, emails, and internal links keep working.

import { redirect } from "next/navigation";

export default function AccountWishlistRedirect() {
  redirect("/wishlist");
}
