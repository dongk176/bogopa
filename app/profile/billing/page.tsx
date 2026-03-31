import { redirect } from "next/navigation";

export default function BillingPage() {
  redirect("/payment?returnTo=%2Fprofile%2Faccount-settings&notice=store_review_pending");
}

