import 'dotenv/config';
import axios from 'axios';

const DEV_PCT = Number(process.env.PRICE_DEVIATION_PCT ?? 3);
const BOT = process.env.TELEGRAM_BOT_TOKEN!;
const ADMIN = process.env.TELEGRAM_ADMIN_CHAT_ID!;

async function loop() {
  try {
    const r = await axios.get('http://localhost:8787/api/price');
    const { dmdUsd } = r.data;
    // TODO: ersetze dexUsd durch echten DEX-Preis; hier Dummy = dmdUsd
    const dexUsd = dmdUsd;
    const diff = Math.abs(dexUsd - dmdUsd) / dmdUsd * 100;
    if (diff > DEV_PCT) {
      await axios.post(`https://api.telegram.org/bot${BOT}/sendMessage`, {
        chat_id: ADMIN,
        text: `⚠️ DMD Preisabweichung ${diff.toFixed(2)} %`
      });
    }
  } catch(e) { /* noop */ }
  setTimeout(loop, 15000);
}
loop();
