// src/utils/onchainPrice.ts
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { Program, AnchorProvider, BN } from '@coral-xyz/anchor';
import idl from '../idl/dmd_anchor.json'; // Pfad ggf. anpassen (z. B. ./idl/...)

export const PROGRAM_ID = new PublicKey('EDY4bp4fXWkAJpJhXUMZLL7fjpDhpKZQFPpygzsTMzro');
export const VAULT_PDA = new PublicKey('AfbZG6WHh462YduimCUmAvVi3jSjGfkaQCyEnYPeXwPF');
export const TREASURY_PDA = new PublicKey('9fAjEDdFjmGwwxh5fyUhDsbyg8RwE7TR12Y25iD4FCoS');

export async function calculateAlignedMinOutDmd(
  connection: Connection,
  amountInLamports: number | bigint,
  slippageBps: number = 200
): Promise<bigint> {
  const provider = new AnchorProvider(connection, { publicKey: PublicKey.default } as any, {});
  const program = new Program(idl as any, PROGRAM_ID, provider);

  const [vaultConfigPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('vault_config_v2'), VAULT_PDA.toBuffer()],
    PROGRAM_ID
  );

  const config = await program.account.vaultConfigV2.fetch(vaultConfigPda);
  const vault = await program.account.vault.fetch(VAULT_PDA);

  const vaultTokenBalance = await connection.getTokenAccountBalance(vault.tokenAccount);
  const vaultDmd = Number(vaultTokenBalance.value.uiAmount ?? 0);

  const treasuryLamports = (await connection.getAccountInfo(TREASURY_PDA))?.lamports ?? 0;

  let base = config.manualPriceLamportsPer10k?.toNumber() ?? 0;
  if (base === 0) {
    base = vault.initialPriceSol?.toNumber() * LAMPORTS_PER_SOL ?? 0;
  }
  if (base === 0) throw new Error('Kein gültiger Basispreis');

  let surcharge = 0;
  if (treasuryLamports < 10 * LAMPORTS_PER_SOL) surcharge += 1000;
  else if (treasuryLamports < 25 * LAMPORTS_PER_SOL) surcharge += 500;

  if (vaultDmd < 1_000_000) surcharge += 1000;
  else if (vaultDmd < 5_000_000) surcharge += 500;

  const effective = Math.floor(base * (10000 + surcharge) / 10000);

  const amountBig = BigInt(amountInLamports);
  const expectedUnits = (amountBig * 10000n * 1_000_000_000n) / BigInt(effective);
  const minOutUnits = (expectedUnits * (10000n - BigInt(slippageBps))) / 10000n;

  console.log('[aligned min-out]', {
    effectiveLamportsPer10k: effective,
    surchargeBps: surcharge,
    expectedDmd: Number(expectedUnits) / 1_000_000_000,
    minOutDmd: Number(minOutUnits) / 1_000_000_000,
  });

  return minOutUnits;
}
