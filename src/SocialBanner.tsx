export default function SocialBanner() {
  return (
    <div className="rounded-2xl p-4 bg-gradient-to-r from-yellow-600/30 to-yellow-300/20 border border-yellow-500/30 shadow-lg">
      <div className="text-2xl font-bold text-yellow-300">DIE MARK DIGITAL</div>
      <div className="text-white/80">Buy • Sell • Claim — Live auf Solana</div>
      <div className="mt-3 flex items-center gap-2">
        <a className="px-3 py-2 rounded-lg bg-black/40 text-white border border-white/10"
           href="https://longosbongos.github.io/Investor_App_DMD/" target="_blank">Investor App</a>
        <a className="px-3 py-2 rounded-lg bg-black/40 text-white border border-white/10"
           href="https://t.me/DieMarkDigitalOffiziell" target="_blank">Telegram</a>
        <a className="px-3 py-2 rounded-lg bg-black/40 text-white border border-white/10"
           href="https://x.com/intent/tweet?text=Invest%20in%20DMD!%20https://longosbongos.github.io/Investor_App_DMD/" target="_blank">Share on X</a>
      </div>
    </div>
  );
}
