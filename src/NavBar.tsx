export default function NavBar({ walletPk, onConnect, onDisconnect }:{
  walletPk?:string;
  onConnect:()=>void;
  onDisconnect:()=>void;
}) {
  const [role, setRole] = useState<"guest"|"buyer"|"founder">("guest");
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    async function detectRole() {
      if (!walletPk) return setRole("guest");
      if (walletPk === FOUNDER) return setRole("founder");
      try {
        const r = await fetch(`/api/buyerstate/${walletPk}`);
        const j = await r.json();
        if (j.whitelisted || j.buyer) setRole("buyer");
        else setRole("guest");
      } catch { setRole("guest"); }
    }
    detectRole();
  }, [walletPk]);

  const tabs = [
    { path: "/", label: "Dashboard", show: true },
    { path: "/forum", label: "Forum", show: role !== "guest" },
    { path: "/leaderboard", label: "Leaderboard", show: true },
    { path: "/airdrop", label: "Airdrop", show: role === "founder" }
  ];

  return (
    <nav className="sticky top-0 z-50 backdrop-blur bg-[#0b0f14]/90 border-b border-white/10">
      <div className="max-w-7xl mx-auto flex items-center justify-between p-3">
        <div className="flex items-center gap-3">
          <img src="/dmd_logo_bg.svg" alt="DMD" className="w-8 h-8 opacity-70"/>
          <span className="text-lg font-bold text-gold">DIE MARK DIGITAL</span>
        </div>

        {/* Desktop-Tabs */}
        <div className="hidden md:flex items-center gap-3">
          {tabs.filter(t=>t.show).map(t=>(
            <Link key={t.path} to={t.path}
              className={`px-3 py-2 rounded-lg transition ${
                location.pathname===t.path ? "bg-gold/20 text-gold":"text-white/70 hover:text-gold"
              }`}>
              {t.label}
            </Link>
          ))}
          {!walletPk ? (
            <button onClick={onConnect}
              className="px-4 py-2 border border-gold text-gold rounded-lg hover:bg-gold/10 transition">
              Connect
            </button>
          ) : (
            <button onClick={onDisconnect}
              className="px-3 py-2 border border-white/20 text-white/70 rounded-lg hover:text-gold transition">
              {walletPk.slice(0,4)}…{walletPk.slice(-4)}
            </button>
          )}
        </div>

        {/* Hamburger Icon */}
        <div className="md:hidden flex items-center">
          <button onClick={()=>setMenuOpen(!menuOpen)} className="text-white focus:outline-none">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2}
              viewBox="0 0 24 24">
              {menuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile-Dropdown */}
      {menuOpen && (
        <div className="md:hidden flex flex-col bg-[#0b0f14]/95 border-t border-white/10 p-3 space-y-2">
          {tabs.filter(t=>t.show).map(t=>(
            <Link key={t.path} to={t.path} onClick={()=>setMenuOpen(false)}
              className={`px-3 py-2 rounded-lg ${
                location.pathname===t.path ? "bg-gold/20 text-gold":"text-white/70 hover:text-gold"
              }`}>
              {t.label}
            </Link>
          ))}
          {!walletPk ? (
            <button onClick={()=>{setMenuOpen(false);onConnect();}}
              className="px-4 py-2 border border-gold text-gold rounded-lg hover:bg-gold/10 transition">
              Connect Wallet
            </button>
          ) : (
            <button onClick={()=>{setMenuOpen(false);onDisconnect();}}
              className="px-4 py-2 border border-white/20 text-white/70 rounded-lg hover:text-gold transition">
              Disconnect
            </button>
          )}
        </div>
      )}
    </nav>
  );
}
