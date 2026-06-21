import type { Metadata } from "next";

export const dynamic = "force-dynamic";
import React from 'react'
import FacebookDataDeletionPage from './facebookData'

export const metadata: Metadata = {
  title: "Facebook data deletion",
  robots: { index: false, follow: true, nocache: true },
};

const page = () => {
  return (
    <FacebookDataDeletionPage/>
  )
}

export default page