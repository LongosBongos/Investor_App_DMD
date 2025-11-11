import { useEffect, useState } from 'react';
import axios from 'axios';
import StatsCard from '../components/StatsCard';
import PriceChart from '../components/PriceChart';
import { TxFeed } from '../components/TxFeed';
import SocialBanner from '../components/SocialBanner';

const FOUNDER_PUBKEY = 'AqPFb5LWQuzKiyoKTX9XgUwsYWoFvpeE8E8uzQvnDTzT';

export default function Dashboard({ walletPubkey }:{walletPubkey?:string}) {
  const [stats, setStats] = useState<any>({});
  const [price, setPrice] = useState<any>({});
  const [chart, setChart] = useState<{time:string;price:number}[]>([]);
  const [events,setEvents]=useState<any[]>([]);
  const [treasury,setTreasury]=useState<any[]>([]);
  const [founder,setFounder]=useState<any[]>([]);
  const isFounder = walletPubkey===FOUNDER_PUBKEY;

  async function pull() {
    const [s,p,e,t]=await Promise.all([
      axios.get('/api/stats'),
      axios.get('/api/price'),
      axios.get('/api/events'),
      axios.get('/api/treasury-events')
    ]);
    setStats(s.data); setPrice(p.data); setEvents(e.data); setTreasury(t.data);
    setChart(prev=>[...prev.slice(-200),{time:new Date().toLocaleTimeString(),price:p.data.dmdUsd}]);
    if(isFounder){const f=await axios.get('/api/founder-events');setFounder(f.data);}
  }
  useEffect(()=>{pull();const i=setInterval(pull,5000);return()=>clearInterval(i);},[isFounder]);

  return (
    <div className="max-w-6xl mx-auto p-4 space-y-4">
      <SocialBanner/>
      <div className="grid md:grid-cols-3 gap-4">
        <StatsCard title="Vault" value={`${(stats.vaultSOL??0).toFixed(2)} SOL`}/>
        <StatsCard title="Treasury" value={`${(stats.treasurySOL??0).toFixed(2)} SOL`}/>
        {isFounder && <StatsCard title="Founder" value={`${(stats.founderSOL??0).toFixed(2)} SOL`} hint="Privat"/>}
      </div>
      <div className="grid md:grid-cols-3 gap-4">
        <StatsCard title="Preis USD/DMD" value={`$${(price.dmdUsd??0).toFixed(6)}`}/>
        <StatsCard title="SOL/USD" value={`$${price.solUsd??0}`}/>
        <StatsCard title="Intervall" value="Live • 5 s"/>
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
