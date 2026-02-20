import { Connection, PublicKey } from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';
import idl from './utils/idl/dmd_anchor.json' assert { type:'json' };

export async function checkBuyerState(wallet: string) {
  const conn = new Connection(process.env.RPC_URL!, 'confirmed');
  const provider = new anchor.AnchorProvider(conn, {} as any, {});
  const program = new anchor.Program(idl, new PublicKey(process.env.PROGRAM_ID!), provider);

  const [buyerPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('buyer'), new PublicKey(wallet).toBuffer()],
    new PublicKey(process.env.PROGRAM_ID!)
  );

  try {
    const buyerState = await program.account.buyerState.fetch(buyerPda);
    return {
      whitelisted: buyerState.isWhitelisted,
      buyer: buyerState.totalBought.toNumber() > 0
    };
  } catch {
    return { whitelisted: false, buyer: false };
  }
}
