import { useEffect, useState } from 'react';
import axios from 'axios';
import StatsCard from '../components/StatsCard';
import PriceChart from '../components/PriceChart';
import { TxFeed } from '../components/TxFeed';
import SocialBanner from '../components/SocialBanner';

const FOUNDER = 'AqPFb5LWQuzKiyoKTX9XgUwsYWoFvpeE8E8uzQvnDTzT';

export default function Dashboard({ walletPubkey }:{walletPubkey?:string}) {
  const [stats, setStats] = useState<any>({});
  const [price, setPrice] = useState<any>({});
  const [chart, setChart] = useState<{time:string;price:number}[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [treasury, setTreasury] = useState<any[]>([]);
  const [founder, setFounder] = useState<any[]>([]);
  const isFounder = walletPubkey === FOUNDER;

  async function pull(){
    const [s,p,e,t] = await Promise.all([
      axios.get('/api/stats'),
      axios.get('/api/price'),
      axios.get('/api/events?limit=50'),
      axios.get('/api/treasury-events?limit=50')
    ]);
    setStats(s.data); setPrice(p.data);
    setEvents(e.data); setTreasury(t.data);
    setChart(prev=>[...prev.slice(-600), { time: new Date().toLocaleTimeString(), price: p.data.dmdUsd }]);
    if(isFounder){
      const f = await axios.get('/api/founder-events?limit=50');
      setFounder(f.data);
    }
  }

  useEffect(()=>{ pull(); const i=setInterval(pull, 5000); return ()=>clearInterval(i); }, [isFounder]);

  return (
    <div className="max-w-7xl mx-auto p-4 space-y-4">
      <SocialBanner/>

      <div className="grid md:grid-cols-3 gap-4">
        <StatsCard title="Public Sale" value={stats.publicSaleActive ? 'Aktiv' : 'Inaktiv'} />
        <StatsCard title="Treasury" value={`${(stats.treasurySOL ?? 0).toFixed(2)} SOL`} />
        {isFounder
          ? <StatsCard title="Founder" value={`${(stats.founderSOL ?? 0).toFixed(2)} SOL`} hint="Privat sichtbar" />
          : <StatsCard title="Vault" value={`${(stats.vaultSOL ?? 0).toFixed(2)} SOL`} />
        }
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <StatsCard title="Preis (USD/DMD)" value={price?.dmdUsd ? `$${price.dmdUsd.toFixed(6)}` : '...'} />
        <StatsCard title="SOL/USD" value={price?.solUsd ? `$${price.solUsd}` : '...'} />
        <StatsCard title="1 SOL = DMD" value={price?.dmdPerSol ? `${price.dmdPerSol}` : '...'} />
      </div>

      <PriceChart data={chart}/>

      <div className="grid md:grid-cols-2 gap-4">
        <TxFeed title="Live Feed" transactions={events}/>
        <TxFeed title="Treasury Feed" transactions={treasury}/>
        {isFounder && <TxFeed title="Founder Feed" transactions={founder}/>}
      </div>
    </div>
  );
}
