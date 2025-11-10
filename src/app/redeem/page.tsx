'use client';

import { RedeemWidget } from "@/components/redeem/redeem-widget";
import { WalletConnector } from "@/components/wallet/wallet-connector";

export default function RedeemPage() {
  return (
    <>
      <style jsx global>{`
        /* Disable global background grid and centered body just for /redeem */
        html {
          overflow: auto !important;
          height: auto !important;
        }
        body {
          display: block !important;
          place-items: initial !important;
          min-height: auto !important;
          max-height: none !important;
          overflow: auto !important;
        }
        body::before {
          display: none !important;
        }
      `}</style>
      <div>
        <div style={{ display: "flex", justifyContent: "flex-end", padding: "16px" }}>
          <WalletConnector />
        </div>
        <div style={{ maxWidth: "768px", margin: "24px auto", padding: "0 16px", position: "relative", zIndex: 1000 }}>
          <RedeemWidget variant="simple" />
        </div>
      </div>
    </>
  );
}


