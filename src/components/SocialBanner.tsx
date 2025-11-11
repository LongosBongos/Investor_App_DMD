export default function SocialBanner() {
  return (
    <div className="rounded-2xl p-4 bg-gradient-to-r from-yellow-600/30 to-yellow-300/20 border border-yellow-500/30">
      <div className="text-2xl font-bold text-yellow-300">DIE MARK DIGITAL</div>
      <div className="text-white/80">Buy • Sell • Claim — Live auf Solana</div>
      <div className="mt-3 flex gap-2">
        <a href="https://longosbongos.github.io/Investor_App_DMD/" className="px-3 py-2 bg-black/40 rounded border border-white/10 text-white">Investor App</a>
        <a href="https://t.me/DieMarkDigitalOffiziell" className="px-3 py-2 bg-black/40 rounded border border-white/10 text-white">Telegram</a>
        <a href="https://x.com/intent/tweet?text=Invest%20in%20DMD!" className="px-3 py-2 bg-black/40 rounded border border-white/10 text-white">Share on X</a>
      </div>
    </div>
  );
}
