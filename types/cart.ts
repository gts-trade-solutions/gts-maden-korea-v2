// /types/cart.ts
export type CalcLine = {
  product_id: string;
  qty: number;
};

export type CalcResponse = {
  ok: boolean;
  currency: string;
  subtotal: number;
  shipping_fee: number;
  discount_total: number;
  total: number;
  commission_total: number; // informational
  applied: null | {
    type: "promo";
    code: string;
    scope: "global" | "product";
    influencer_id: string;
  };
  lines: Array<{
    product_id: string;
    qty: number;
    unit_price: number;
    line_subtotal: number;
    promo_applied: boolean;
    effective_user_discount_pct: number;
    effective_commission_pct: number;
    line_discount: number;
    line_commission: number;
  }>;
};
