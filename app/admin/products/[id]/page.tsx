"use client";

import { AdminProductEditor } from "./AdminProductEditor";



export default function AdminEditProductPage({ params }: { params: { id: string } }) {
  return <AdminProductEditor productId={params.id} />;
}
