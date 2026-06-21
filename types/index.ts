export type UserRole = 'admin' | 'vendor' | 'customer' | 'guest';

export type OrderStatus = 'processing' | 'dispatched' | 'delivered' | 'cancelled' | 'returned';
export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded';
export type FulfillmentStatus = 'unfulfilled' | 'partially_fulfilled' | 'fulfilled';
export type ProductStatus = 'draft' | 'active' | 'hidden';
export type ProductVisibility = 'site' | 'app' | 'search';
export type VendorStatus = 'pending' | 'approved' | 'declined' | 'suspended' | 'holiday';

export interface Product {
  id: string;
  title: string;
  handle: string;
  description: string;
  description_html?: string;
  brand_id: string;
  brand_name?: string;
  category_ids: string[];
  price: number;
  compare_at_price?: number;
  currency: string;
  tax_class?: string;
  sku: string;
  barcode?: string;
  variants: ProductVariant[];
  images: string[];
  videos?: string[];
  thumbnail: string;
  inventory: ProductInventory;
  vendor_id: string;
  vendor_name?: string;
  seo: SEO;
  editorial_flags: EditorialFlags;
  status: ProductStatus;
  visibility: ProductVisibility;
  rating_avg?: number;
  rating_count?: number;
  created_at: string;
  updated_at: string;
}

export interface ProductVariant {
  id: string;
  product_id: string;
  options: Record<string, string>;
  sku: string;
  price?: number;
  compare_at_price?: number;
  inventory?: number;
  image?: string;
}

export interface ProductInventory {
  qty: number;
  track_inventory: boolean;
  low_stock_threshold: number;
}

export interface EditorialFlags {
  trending: boolean;
  bestseller: boolean;
  new_arrival: boolean;
  featured: boolean;
}

export interface SEO {
  meta_title: string;
  meta_description: string;
  keywords: string[];
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  parent_id?: string | null;
  position: number;
  template: number;
  hero_banners: Banner[];
  seo: SEO;
  image?: string;
  description?: string;
  children?: Category[];
}

export interface Brand {
  id: string;
  name: string;
  slug: string;
  logo: string;
  banner?: string;
  description: string;
  seo: SEO;
  product_count?: number;
}

export interface Vendor {
  id: string;
  company_name: string;
  contact_name: string;
  email: string;
  phone: string;
  kyc_docs: string[];
  gst_tax_id?: string;
  payout_method: PayoutMethod;
  commission_rate: number;
  status: VendorStatus;
  created_at: string;
  updated_at: string;
  bank_details?: BankDetails;
  address?: Address;
}

export interface BankDetails {
  account_holder_name: string;
  account_number: string;
  bank_name: string;
  ifsc_code: string;
  account_type: 'savings' | 'current';
}

export interface PayoutMethod {
  type: 'bank_transfer' | 'upi' | 'paypal';
  details: Record<string, string>;
}

export interface Order {
  id: string;
  order_number: string;
  customer_id: string;
  customer: Customer;
  items: OrderItem[];
  subtotal: number;
  tax: number;
  shipping_cost: number;
  discount: number;
  total: number;
  currency: string;
  payment_status: PaymentStatus;
  payment_method: string;
  fulfillment_status: FulfillmentStatus;
  shipping_address: Address;
  billing_address: Address;
  timeline_events: TimelineEvent[];
  notes?: string;
  coupon_code?: string;
  created_at: string;
  updated_at: string;
}

export interface OrderItem {
  id: string;
  product_id: string;
  product_title: string;
  product_image: string;
  variant_id?: string;
  variant_options?: Record<string, string>;
  sku: string;
  vendor_id: string;
  vendor_name: string;
  quantity: number;
  price: number;
  total: number;
}

export interface TimelineEvent {
  id: string;
  timestamp: string;
  status: string;
  message: string;
  user?: string;
}

export interface Customer {
  id: string;
  email: string;
  name: string;
  phone?: string;
  addresses: Address[];
  default_address_id?: string;
  created_at: string;
  updated_at: string;
}

export interface Address {
  id: string;
  name: string;
  phone: string;
  address_line1: string;
  address_line2?: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  is_default: boolean;
}

export interface Banner {
  id: string;
  image?: string;
  video_url?: string;
  alt: string;
  link_url?: string;
  position: number;
  page_scope: string;
  active: boolean;
}

export interface CMSPage {
  id: string;
  title: string;
  slug: string;
  content: string;
  seo: SEO;
  published: boolean;
  created_at: string;
  updated_at: string;
}

export interface Review {
  id: string;
  product_id: string;
  customer_id: string;
  customer_name: string;
  rating: number;
  title: string;
  content: string;
  images?: string[];
  verified_purchase: boolean;
  helpful_count: number;
  created_at: string;
}

export interface CartItem {
  product_id: string;
  variant_id?: string;
  quantity: number;
  product?: Product;
}

export interface Coupon {
  id: string;
  code: string;
  type: 'percentage' | 'fixed';
  value: number;
  min_purchase?: number;
  max_discount?: number;
  valid_from: string;
  valid_to: string;
  active: boolean;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  vendor_id?: string;
  customer_id?: string;
  created_at: string;
}

export interface AuthSession {
  user: User;
  token: string;
  expires_at: string;
}

export interface Payout {
  id: string;
  vendor_id: string;
  amount: number;
  commission: number;
  net_amount: number;
  status: 'pending' | 'processing' | 'paid';
  period_start: string;
  period_end: string;
  created_at: string;
  paid_at?: string;
}

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  read: boolean;
  link?: string;
  created_at: string;
}

export interface SearchSuggestion {
  type: 'product' | 'category' | 'brand';
  id: string;
  title: string;
  image?: string;
  url: string;
}

export interface FilterOptions {
  categories?: string[];
  brands?: string[];
  price_min?: number;
  price_max?: number;
  rating?: number;
  editorial_flags?: Partial<EditorialFlags>;
  in_stock?: boolean;
}

export interface PaginationMeta {
  page: number;
  per_page: number;
  total: number;
  total_pages: number;
}

export interface ApiResponse<T> {
  data: T;
  meta?: PaginationMeta;
  error?: string;
}

export interface ProductVideo {
  id: string;
  product_id: string;
  video_url: string;
  thumbnail_url: string;
  title: string;
  description: string;
  price: number;
  display_order: number;
  active: boolean;
}

export interface InfluencerVideo {
  id: string;
  influencer_name: string;
  influencer_handle: string;
  video_url: string;
  thumbnail_url: string;
  caption: string;
  instagram_link: string;
  views: string;
  display_order: number;
  active: boolean;
}
