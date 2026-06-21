
import type { Metadata } from "next";

export const dynamic = "force-dynamic";
import React from 'react'
import CheckoutPage from './checkout'

export const metadata: Metadata = {
  title: "Checkout",
  robots: { index: false, follow: false, nocache: true },
};

const page = () => {
  return (
    <CheckoutPage/>
  )
}

export default page