// lib/pricing.ts

import { db } from './db';

export async function getPrice(symbol: string, network: string): Promise<number> {
  const record = await db.tokenPrice.findFirst({
    where: {
      symbol,
      network,
    },
  });

  return record?.priceUsd || 1.0; // fallback default
}
