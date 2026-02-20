import { useEffect, useState } from "react";

export default function WelcomeOverlay(){
  const [show, setShow] = useState(true);
  useEffect(()=>{ const t=setTimeout(()=>setShow(false),2500); return()=>clearTimeout(t); },[]);
  if(!show) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#0b0f14]">
      <div className="text-center space-y-3 animate-fadeIn">
        <img src="/dmd_logo_bg.svg" alt="DMD" className="w-24 h-24 mx-auto opacity-80 animate-pulse" />
        <div className="text-3xl font-bold text-gold tracking-wide">DIE MARK DIGITAL</div>
        <div className="text-white/60 text-sm">Version 3.5 — Investor Dashboard Live</div>
      </div>
    </div>
  );
}
