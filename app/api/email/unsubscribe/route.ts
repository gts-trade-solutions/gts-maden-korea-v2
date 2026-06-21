import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const supabase = createServiceClient();
  const url = new URL(req.url);
  const email = url.searchParams.get("email");
  const cid = url.searchParams.get("cid"); // campaign id (optional)

  if (!email) {
    return new NextResponse(
      "<h1>Unsubscribe</h1><p>Missing email.</p>",
      { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }

  const emailLower = email.trim().toLowerCase();

  await supabase
    .from("email_unsubscribe")
    .upsert(
      {
        email: emailLower,
        source: "user",
        campaign_id: cid || null,
      },
      { onConflict: "email" }
    );

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Unsubscribed</title>
        <style>
          body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; padding: 40px; line-height: 1.5; }
          .card { max-width: 480px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 12px; padding: 24px; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.05); }
          h1 { font-size: 20px; margin-bottom: 8px; }
          p { font-size: 14px; color: #4b5563; }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>You've been unsubscribed</h1>
          <p>${emailLower} will no longer receive marketing emails from us.</p>
        </div>
      </body>
    </html>
  `;

  return new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
