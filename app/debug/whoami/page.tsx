import { notFound } from "next/navigation";
import WhoAmIClient from "./WhoAmIClient";

export default function WhoAmIPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return <WhoAmIClient />;
}
