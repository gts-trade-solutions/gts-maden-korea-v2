// somewhere global, e.g. /types/razorpay.d.ts
export {};

declare global {
  interface Window {
    Razorpay?: any;
  }
}
