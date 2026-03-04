# Flash Exchange — Backend

Complete Node.js backend for the Flash Exchange token sale platform.

## Architecture

```
flash-exchange/
├── server.js                         # Entry point — wires Express + services
├── src/
│   ├── config/index.js               # All env vars with validation
│   ├── db/
│   │   ├── index.js                  # pg pool + auto-migration runner
│   │   └── schema.sql                # Full schema (idempotent)
│   ├── api/
│   │   ├── routes/orders.js          # POST /api/order, GET /api/order/:id
│   │   ├── routes/admin.js           # GET /api/admin/stats (Basic Auth)
│   │   └── middleware/basicAuth.js   # Timing-safe Basic Auth
│   ├── services/
│   │   ├── price-updater.js          # CoinGecko polling every 60s
│   │   ├── blockchain-scanner.js     # BSC + ETH + Tron polling every 20s
│   │   ├── matching-engine.js        # Strict amount-based order matching
│   │   └── token-sender.js           # ERC20 transfer + 3x retry logic
│   └── utils/
│       ├── logger.js                 # Winston (JSON in prod, pretty in dev)
│       └── uniqueAmount.js           # Fingerprint generation + collision check
├── public/                           # Frontend static files
│   └── assets/js/theme.js            # API integration + payment modal
├── Dockerfile
├── docker-compose.yml
└── .env.example
```

## Quick Start (Local Dev)

```bash
# 1. Clone and install
npm install

# 2. Configure
cp .env.example .env
# Edit .env with your actual values

# 3. Start Postgres (or use docker-compose)
docker compose up postgres -d

# 4. Run the app
npm run dev
# → http://localhost:3000
```

## Deploy to Coolify

1. Push this repository to GitHub/GitLab.
2. In Coolify → **New Resource → Docker Compose**.
3. Paste your repo URL and select `docker-compose.yml`.
4. Set all environment variables in the Coolify **Environment Variables** panel.
5. Enable **Auto Deploy** if desired.
6. Coolify handles SSL via its Traefik proxy automatically.

**Critical env vars for Coolify:**
```
DISTRIBUTION_WALLET_PRIVATE_KEY=0x...
DISTRIBUTION_WALLET_ADDRESS=0x...
TOKEN_CONTRACT_ADDRESS=0x...
BSC_PAYMENT_ADDRESS=0x...
ETH_PAYMENT_ADDRESS=0x...
TRON_PAYMENT_ADDRESS=T...
ADMIN_PASSWORD=something_secure
PGPASSWORD=something_secure
```

## API Reference

### `POST /api/order`
Create a new purchase order.

**Request:**
```json
{
  "usdt_amount": 100,
  "payment_method": "bnb",
  "receiving_wallet": "0xYourWallet"
}
```

**Response:**
```json
{
  "orderId": "uuid",
  "paymentAddress": "0x...",
  "uniqueCryptoAmount": "0.14231841",
  "coinSymbol": "BNB",
  "tokenAmount": 5000,
  "expiresAt": "2026-...",
  "instruction": "Send exactly 0.14231841 BNB to 0x..."
}
```

Payment methods: `bnb`, `usdt-bep20`, `eth`, `usdt-erc20`, `trx`, `usdt-trc20`

### `GET /api/order/:id`
Poll for order status. Call every 5 seconds from frontend.

Statuses: `waiting_payment` → `matched` → `sending` → `completed`

### `GET /api/admin/stats`
Basic Auth. Returns total revenue, unmatched transactions, live prices.

```bash
curl -u admin:password http://your-domain/api/admin/stats
```

## Unique Amount Algorithm

```
base = usdtAmount / coinPriceUSD            # e.g. 100 / 700 = 0.142857 BNB
truncated = floor(base × 1000) / 1000       # = 0.142
fingerprint = randomInt(10000, 99999)       # e.g. 31841
uniqueAmount = truncated + fingerprint/1e8  # = 0.142 + 0.00031841 = 0.14231841
```

The buyer pays `0.14231841 BNB`. The matching engine finds the order by exact NUMERIC match.

## Supported Networks & Coins

| Method       | Network | Coin | Contract                                     |
|-------------|---------|------|----------------------------------------------|
| bnb          | BSC     | BNB  | Native                                       |
| usdt-bep20   | BSC     | USDT | 0x55d398326f99059ff775485246999027b3197955   |
| eth          | ETH     | ETH  | Native                                       |
| usdt-erc20   | ETH     | USDT | 0xdAC17F958D2ee523a2206206994597C13D831ec7   |
| trx          | Tron    | TRX  | Native                                       |
| usdt-trc20   | Tron    | USDT | TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t          |

## Production Recommendations

- **RPC Providers**: Use QuickNode, Alchemy, or Infura instead of public RPCs. Public nodes are rate-limited and unreliable.
- **TronGrid**: Get a free API key at trongrid.io — without it, Tron scanning may hit 429s.
- **CoinGecko**: Get a Demo API key at coingecko.com — free, just requires signup.
- **Private Key Security**: Never log or expose `DISTRIBUTION_WALLET_PRIVATE_KEY`. Use Coolify's secret management.
- **Database Backups**: Set up automated Postgres backups. Orders are your financial records.
