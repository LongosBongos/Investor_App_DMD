import { useEffect, useState } from "react";

export default function WelcomeOverlay() {
  const [show, setShow] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => setShow(false), 2600);
    return () => window.clearTimeout(timer);
  }, []);

  if (!show) return null;

  const logoUrl = `${import.meta.env.BASE_URL}dmd_logo_bg.svg`;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 999999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background:
          "radial-gradient(circle at 50% 35%, rgba(18,24,35,0.88) 0%, rgba(5,7,11,0.96) 45%, #05070b 100%)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        padding: "24px",
      }}
    >
      <div
        style={{
          width: "min(94vw, 640px)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          padding: "52px 34px",
          borderRadius: 28,
          background:
            "linear-gradient(180deg, rgba(15,18,24,0.78), rgba(5,7,11,0.72))",
          border: "1px solid rgba(245,197,66,0.14)",
          boxShadow:
            "0 24px 80px rgba(0,0,0,0.58), 0 0 40px rgba(245,197,66,0.06)",
        }}
      >
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.28em",
            textTransform: "uppercase",
            color: "rgba(245,197,66,0.78)",
            marginBottom: 18,
          }}
        >
          Premium Trading Platform
        </div>

        <div
          style={{
            width: 156,
            height: 156,
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background:
              "radial-gradient(circle at 50% 50%, rgba(245,197,66,0.10) 0%, rgba(245,197,66,0.03) 45%, rgba(245,197,66,0.00) 72%)",
            boxShadow:
              "0 0 0 1px rgba(245,197,66,0.10), 0 0 30px rgba(245,197,66,0.08)",
            marginBottom: 28,
            overflow: "hidden",
            flexShrink: 0,
          }}
        >
          <img
            src={logoUrl}
            alt="DMD"
            style={{
              width: 112,
              height: 112,
              objectFit: "contain",
              display: "block",
              opacity: 0.96,
              filter: "drop-shadow(0 0 10px rgba(245,197,66,0.12))",
            }}
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
        </div>

        <div
          style={{
            fontFamily: '"Inter", system-ui, sans-serif',
            fontSize: "clamp(40px, 4.8vw, 68px)",
            fontWeight: 900,
            lineHeight: 0.98,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            color: "#f5c542",
            textShadow:
              "0 0 18px rgba(245,197,66,0.12), 0 6px 28px rgba(0,0,0,0.45)",
            marginBottom: 18,
          }}
        >
          Die Mark
          <br />
          Digital
        </div>

        <div
          style={{
            fontSize: 15,
            fontWeight: 600,
            letterSpacing: "0.02em",
            color: "rgba(255,255,255,0.76)",
            marginBottom: 10,
            lineHeight: 1.55,
            maxWidth: 460,
          }}
        >
          Willkommen auf der digitalen Handelsplattform für die nächste Generation
          strategischer Marktteilnehmer.
        </div>

        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "rgba(245,197,66,0.72)",
            marginBottom: 22,
          }}
        >
          Investor Access · Version 3.5 Live
        </div>

        <div
          style={{
            width: 110,
            height: 2,
            borderRadius: 999,
            background:
              "linear-gradient(90deg, rgba(245,197,66,0.05), rgba(245,197,66,0.72), rgba(245,197,66,0.05))",
            boxShadow: "0 0 14px rgba(245,197,66,0.18)",
          }}
        />
      </div>
    </div>
  );
}