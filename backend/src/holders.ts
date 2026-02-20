import { Connection, PublicKey } from '@solana/web3.js';

export async function topHolders(rpcUrl:string, mintStr:string, limit=25){
  const conn = new Connection(rpcUrl, 'confirmed');
  const mint = new PublicKey(mintStr);
  const largest = await conn.getTokenLargestAccounts(mint);
  const out:any[] = [];
  for (const info of largest.value.slice(0, limit)) {
    const ai = await conn.getParsedAccountInfo(info.address);
    const owner = (ai.value as any)?.data?.parsed?.info?.owner;
    const amt = Number(info.amount) / 1e6; // 6 decimals
    out.push({ owner, amount: amt });
  }
  return out;
}
