/* eslint-disable react/no-unescaped-entities */
"use client";

import { CustomerLayout } from "@/components/CustomerLayout";

export default function FacebookDataDeletionPage() {
  return (
    <CustomerLayout>
      <div className="container mx-auto py-16 max-w-2xl">
        <h1 className="text-3xl font-bold mb-6">
          Facebook Data Deletion Instructions
        </h1>

        <p className="text-muted-foreground mb-4">
          According to Facebook platform policies, we must provide a User Data
          Deletion Callback and instructions explaining how Facebook users can
          request deletion of their information from our system.
        </p>

        <h2 className="text-xl font-semibold mt-6 mb-3">
          How to Request Account Deletion
        </h2>

        <p className="mb-4">
          If you have logged into our website using Facebook Login and would
          like to delete your account and associated data, please follow one of
          the methods below:
        </p>

        <h3 className="font-medium mb-2">Method 1 — Manual Request</h3>
        <p className="mb-4">
          Send an email to{" "}
          <a
            className="text-primary underline"
            href="mailto:info@madenkorea.com"
          >
            info@madenkorea.com
          </a>{" "}
          with the subject:{" "}
          <strong>"Facebook Data Deletion Request&quot;</strong>.
          <br />
          Please include the email address or Facebook account ID linked to your
          login.
        </p>

        <h3 className="font-medium mb-2">Method 2 — Direct Deletion URL</h3>
        <p className="mb-4">
          You may also submit a deletion request directly at:
        </p>

        <p className="mb-4">
          <a
            href="/api/facebook/delete-user"
            className="text-primary underline break-all"
          >
            https://madenkorea.com/api/facebook/delete-user
          </a>
        </p>

        <p className="text-muted-foreground mb-4">
          This endpoint will remove your Facebook-authenticated account and all
          data associated with it (profile, orders, settings, etc.) from our
          servers.
        </p>

        <h2 className="text-xl font-semibold mt-6 mb-3">
          What Data Will Be Deleted?
        </h2>

        <ul className="list-disc ml-6 space-y-2">
          <li>Your account profile</li>
          <li>Your email, name, and Facebook-linked identity</li>
          <li>Order history (if any)</li>
          <li>Saved addresses or preferences</li>
          <li>Any other personal data stored in our system</li>
        </ul>

        <h2 className="text-xl font-semibold mt-6 mb-3">Processing Time</h2>
        <p className="text-muted-foreground">
          All data deletion requests are processed within{" "}
          <strong>48 hours</strong>. Once deleted, your account and all
          associated data cannot be recovered.
        </p>
      </div>
    </CustomerLayout>
  );
}
