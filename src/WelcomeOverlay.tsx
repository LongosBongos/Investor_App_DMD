import { useEffect, useState } from "react";

export default function WelcomeOverlay() {
  const [show, setShow] = useState(true);
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setFadeOut(true);
      setTimeout(() => setShow(false), 420); // sanfter Fade-Out
    }, 2600);

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
          "radial-gradient(circle at 50% 32%, rgba(18,24,35,0.92) 0%, rgba(5,7,11,0.98) 48%, #05070b 100%)",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        padding: "24px",
        transition: fadeOut ? "opacity 420ms cubic-bezier(0.23,1,0.32,1), transform 420ms cubic-bezier(0.23,1,0.32,1)" : "none",
        opacity: fadeOut ? 0 : 1,
        transform: fadeOut ? "scale(0.96)" : "scale(1)",
      }}
    >
      <div
        style={{
          width: "min(94vw, 680px)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          padding: "58px 40px 52px",
          borderRadius: 32,
          background:
            "linear-gradient(180deg, rgba(15,18,24,0.82) 0%, rgba(5,7,11,0.78) 100%)",
          border: "1px solid rgba(245,197,66,0.18)",
          boxShadow:
            "0 30px 90px rgba(0,0,0,0.65), 0 0 60px rgba(245,197,66,0.08), inset 0 1px 0 rgba(255,255,255,0.06)",
          transition: "transform 0.4s cubic-bezier(0.23,1,0.32,1)",
        }}
      >
        {/* Premium Logo Circle */}
        <div
          style={{
            width: 172,
            height: 172,
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background:
              "radial-gradient(circle at 50% 50%, rgba(245,197,66,0.14) 0%, rgba(245,197,66,0.04) 52%, transparent 78%)",
            boxShadow:
              "0 0 0 1px rgba(245,197,66,0.22), 0 0 42px rgba(245,197,66,0.12)",
            marginBottom: 32,
            overflow: "hidden",
            animation: "logoPulse 2.8s ease-in-out infinite",
          }}
        >
          <img
            src={logoUrl}
            alt="DMD Logo"
            style={{
              width: 124,
              height: 124,
              objectFit: "contain",
              filter: "drop-shadow(0 0 14px rgba(245,197,66,0.25))",
              transition: "transform 0.6s cubic-bezier(0.23,1,0.32,1)",
            }}
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        </div>

        {/* Title */}
        <div
          style={{
            fontFamily: '"Cinzel", serif',
            fontSize: "clamp(42px, 5.2vw, 74px)",
            fontWeight: 700,
            lineHeight: 0.96,
            letterSpacing: "0.03em",
            textTransform: "uppercase",
            background: "linear-gradient(180deg, #f5e6b3 0%, #d4af37 48%, #8a6a12 100%)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
            textShadow: "0 4px 22px rgba(0,0,0,0.6)",
            marginBottom: 14,
          }}
        >
          Die Mark
          <br />
          Digital
        </div>

        {/* Subtitle */}
        <div
          style={{
            fontSize: "clamp(15px, 1.8vw, 17.5px)",
            fontWeight: 600,
            letterSpacing: "0.03em",
            color: "rgba(255,255,255,0.82)",
            maxWidth: 480,
            lineHeight: 1.48,
            marginBottom: 14,
          }}
        >
          Willkommen auf der exklusiven digitalen Handelsplattform für die nächste Generation
          strategischer Marktteilnehmer.
        </div>

        {/* Version Badge */}
        <div
          style={{
            fontSize: 13,
            fontWeight: 800,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: "#f5c542",
            background: "rgba(245,197,66,0.08)",
            padding: "6px 22px",
            borderRadius: 999,
            border: "1px solid rgba(245,197,66,0.22)",
            boxShadow: "0 0 16px rgba(245,197,66,0.15)",
            marginBottom: 28,
          }}
        >
          INVESTOR ACCESS • VERSION 3.5 LIVE
        </div>

        {/* Gold Line */}
        <div
          style={{
            width: 128,
            height: 2,
            background: "linear-gradient(90deg, transparent, #f5c542, transparent)",
            boxShadow: "0 0 18px rgba(245,197,66,0.35)",
          }}
        />
      </div>
    </div>
  );
}