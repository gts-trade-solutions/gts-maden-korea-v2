// utils/getVendor.ts
import { supabase } from '@/lib/supabaseClient';

export type VendorInfo = {
  id: string;
  display_name: string;
  slug: string | null;
  status: 'pending'|'approved'|'rejected'|'disabled';
  role: 'owner'|'manager'|'staff'|null;
  rejected_reason?: string | null;
};

export async function fetchMyVendor(): Promise<VendorInfo | null> {
  const { data, error } = await supabase.rpc('get_my_vendor');
  if (error) throw error;
  const arr = Array.isArray(data) ? data : (data ? [data] : []);
  return (arr[0] as VendorInfo) ?? null;
}
