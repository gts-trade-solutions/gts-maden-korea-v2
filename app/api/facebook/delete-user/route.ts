import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // MUST use service role
);

export async function POST(req: Request) {
  try {
    const { facebook_id } = await req.json();

    if (!facebook_id) {
      return NextResponse.json({ error: "facebook_id required" }, { status: 400 });
    }

    // Delete user by Facebook provider UID
    const { error } = await supabase.auth.admin.deleteUser(facebook_id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
