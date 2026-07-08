// Address client helpers. These call the server route handlers under
// /api/account/addresses (MySQL/Prisma, NextAuth-scoped to the current user)
// instead of the old Supabase RPCs. Kept as thin fetch wrappers so callers
// (checkout, account) keep the same function signatures.

export type Address = {
  id: string;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  line1: string;
  line2?: string | null;
  landmark?: string | null;
  city: string;
  state: string;
  pincode: string;
  country: string;       // "India"
  is_default: boolean;
};

async function asJson(res: Response) {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || `Request failed (${res.status})`);
  return body;
}

export async function fetchAddresses(): Promise<Address[]> {
  const res = await fetch("/api/account/addresses", { cache: "no-store" });
  const body = await asJson(res);
  return (body?.addresses ?? []) as Address[];
}

export async function saveAddress(
  a: Partial<Address> & { id?: string; set_default?: boolean }
): Promise<Address> {
  const payload = {
    name: a.name ?? null,
    phone: a.phone ?? null,
    email: a.email ?? null,
    line1: a.line1,
    line2: a.line2 ?? null,
    landmark: a.landmark ?? null,
    city: a.city,
    state: a.state,
    pincode: a.pincode,
    country: a.country ?? "India",
    // The routes clear other defaults when is_default is set, matching the old
    // upsert_address(p_set_default) behavior.
    is_default: !!a.set_default,
  };

  if (a.id) {
    await asJson(
      await fetch(`/api/account/addresses/${a.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
    );
    return { ...(payload as any), id: a.id } as Address;
  }

  const body = await asJson(
    await fetch("/api/account/addresses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
  );
  return { ...(payload as any), id: body?.id } as Address;
}

export async function setDefaultAddress(addressId: string): Promise<void> {
  await asJson(
    await fetch(`/api/account/addresses/${addressId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "set_default" }),
    })
  );
}

export async function deleteAddress(addressId: string): Promise<void> {
  await asJson(
    await fetch(`/api/account/addresses/${addressId}`, { method: "DELETE" })
  );
}
