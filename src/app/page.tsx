import { GridHero } from "@/components/grid-hero";
import { WalletConnector } from "@/components/wallet/wallet-connector";
import { RedeemWidget } from "@/components/redeem/redeem-widget";

export default function Home() {
  return (
    <div style={{ position: "relative", width: "100vw", height: "100vh" }}>
      <GridHero />
      <div
        style={{
          position: "absolute",
          top: "26px",
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 100000,
          pointerEvents: "auto",
          width: "100%",
          maxWidth: "768px",
          padding: "0 16px",
        }}
      >
        <RedeemWidget variant="simple" />
      </div>
      <div
        style={{
          position: "absolute",
          top: "16px",
          right: "16px",
          zIndex: 100000,
          pointerEvents: "auto",
        }}
      >
        <WalletConnector />
      </div>
    </div>
  );
}
