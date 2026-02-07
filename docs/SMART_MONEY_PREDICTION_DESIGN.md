# Smart Money Prediction System: Technical Design Document

## Abstract

Данный документ описывает архитектуру и методологию построения системы предсказания направления движения криптовалют на 15-минутных интервалах. Система агрегирует множественные сигналы (Long/Short Ratio, Order Book Imbalance, Technical Analysis Indicators) и применяет взвешенную модель для генерации предиктов с корректируемым winrate.

---

## 1. Проблема: Почему 1GB за 10 секунд?

### 1.1 Диагностика

Текущая реализация `SmartMoneyPredictionStage` **эмитит на каждое обновление** любого источника:

```typescript
// ПРОБЛЕМА: updated = true на КАЖДЫЙ апдейт
if (topic === "normalized-books") {
  // ... обновление state
  updated = true; // ← Это триггерится ~10 раз в секунду!
}

if (updated) {
  return { ...this.state }; // ← Копирование ВСЕГО state каждый раз
}
```

**Частота входящих данных:**

| Source                    | Frequency                 | Data Size per Event |
| ------------------------- | ------------------------- | ------------------- |
| `normalized-books`        | ~100ms (WebSocket depth)  | ~2-5 KB             |
| `binance-ls-aggregated`   | ~1 min (4 symbols × emit) | ~1 KB               |
| `tradingview-tech-source` | 15 min                    | ~10 KB              |
| `traders-union-source`    | 15 min                    | ~5 KB               |

**Расчет:**

- Order books: 3 sources × 10 updates/sec × 5KB = **150 KB/sec**
- При каждом апдейте эмитится полный `SmartMoneyState` (все 4 символа + tvData + tuData)
- С downstream subscribers и сериализацией: **~1.5 MB/sec** → **~90 MB/min** → **~900 MB/10 min**

### 1.2 Решение

**Не эмитить на каждый апдейт!** Только на 15-минутный тик:

```typescript
// ПРАВИЛЬНО: Пассивный сбор, активный эмит только по тику
if (topic === "interval-ticker-source") {
  // Emit prediction candidates ONCE per window
  return this.generatePredictionBatch(data.timestamp);
}

// Все остальные топики - просто обновляем state, return null
if (topic === "normalized-books") {
  this.updateOrderBookState(data);
  return null; // ← НЕ эмитим!
}
```

---

## 2. Архитектура Prediction Pipeline

### 2.1 Data Flow Diagram

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│ Binance LS      │     │ TradingView     │     │ Traders Union   │
│ (1 min poll)    │     │ (15 min poll)   │     │ (15 min poll)   │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌────────────────────────────────────────────────────────────────────┐
│                    SmartMoneyPredictionStage                       │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ Internal State Buffer (NOT emitted on every update)         │   │
│  │ { BTCUSDT: { ls, tv, tu, book }, ETHUSDT: {...}, ... }      │   │
│  └─────────────────────────────────────────────────────────────┘   │
└────────────────────────────────┬───────────────────────────────────┘
                                 │
         ┌───────────────────────┼───────────────────────┐
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│ Order Books     │     │ IntervalTicker  │     │ (Other sources) │
│ (100ms WS)      │     │ (15 min tick)   │     │                 │
└─────────────────┘     └────────┬────────┘     └─────────────────┘
                                 │
                                 ▼
                    ┌─────────────────────────┐
                    │ EMIT: PredictionBatch   │
                    │ (Once per 15 min only)  │
                    └────────────┬────────────┘
                                 │
                                 ▼
                    ┌─────────────────────────┐
                    │ SmartMoneyEvaluator     │
                    │ (Next Stage - TODO)     │
                    └─────────────────────────┘
```

### 2.2 Allowed Symbols

Ограничиваем обработку только ликвидными парами:

```typescript
const ALLOWED_SYMBOLS = new Set(["BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT"]);
```

---

## 3. Сигналы и их интерпретация

### 3.1 Binance Long/Short Ratio

**Источник:** `binance-ls-aggregated`

| Metric         | Meaning        | Prediction Logic        |
| -------------- | -------------- | ----------------------- |
| `ratio > 1.5`  | Crowd is LONG  | Contrarian: expect DOWN |
| `ratio < 0.67` | Crowd is SHORT | Contrarian: expect UP   |
| `ratio ≈ 1.0`  | Neutral        | No signal               |

**Веc сигнала:** Высокий для contrarian plays, особенно на экстремумах.

### 3.2 Order Book Imbalance

**Источник:** `normalized-books`

```typescript
imbalance = (bidVolume - askVolume) / (bidVolume + askVolume);
// Range: [-1, 1]
```

| Value         | Meaning            | Prediction    |
| ------------- | ------------------ | ------------- |
| `> 0.3`       | Heavy bid pressure | UP momentum   |
| `< -0.3`      | Heavy ask pressure | DOWN momentum |
| `[-0.3, 0.3]` | Balanced           | Neutral       |

**Вес сигнала:** Средний. Order book может быть spoofed.

### 3.3 TradingView Technical Rating

**Источник:** `tradingview-tech-source`

Ключевые колонки:

- `TechRating_1D` - Overall rating [-1, 1]
- `RSI` - Relative Strength Index [0, 100]
- `MARating_1D` - Moving Average rating
- `OsRating_1D` - Oscillators rating

| TechRating | RSI    | Prediction            |
| ---------- | ------ | --------------------- |
| `> 0.5`    | `< 70` | Strong UP             |
| `< -0.5`   | `> 30` | Strong DOWN           |
| `> 0.5`    | `> 80` | Overbought, reversal? |
| `< -0.5`   | `< 20` | Oversold, reversal?   |

**Вес сигнала:** Высокий для trend-following, низкий для reversals.

### 3.4 Traders Union Analysis

**Источник:** `traders-union-source`

Структура данных:

```typescript
{
  m15: {
    forecast: "buy" | "sell" | "neutral",
    direction: "up" | "down" | "none",
    ta: { buy: 8, sell: 2, neutral: 1 },
    ma: { buy: 6, sell: 4, neutral: 1 },
    indicators: [...]
  }
}
```

**Prediction Logic:**

- `m15.forecast === "buy"` + `m15.ta.buy > m15.ta.sell * 2` → Strong UP
- `m15.forecast === "sell"` + `m15.ta.sell > m15.ta.buy * 2` → Strong DOWN

**Вес сигнала:** Средний-высокий для 15m timeframe.

---

## 4. Weighted Scoring Model

### 4.1 Signal Weights (Adjustable)

```typescript
interface SignalWeights {
  lsRatio: number; // Contrarian signal
  orderBookImbalance: number;
  tvTechRating: number;
  tvRsi: number;
  tuForecast: number;
  tuTaBalance: number;
}

const DEFAULT_WEIGHTS: SignalWeights = {
  lsRatio: 0.25,
  orderBookImbalance: 0.15,
  tvTechRating: 0.2,
  tvRsi: 0.1,
  tuForecast: 0.15,
  tuTaBalance: 0.15,
};
```

### 4.2 Score Calculation

```typescript
function calculatePredictionScore(
  candidate: SmartMoneyCandidate,
  weights: SignalWeights,
): number {
  let score = 0;

  // 1. L/S Ratio (Contrarian)
  if (candidate.lsRatio !== undefined) {
    if (candidate.lsRatio > 1.5)
      score -= weights.lsRatio; // Crowd long → predict down
    else if (candidate.lsRatio < 0.67) score += weights.lsRatio; // Crowd short → predict up
  }

  // 2. Order Book Imbalance
  if (candidate.orderBookImbalance !== undefined) {
    score += candidate.orderBookImbalance * weights.orderBookImbalance;
  }

  // 3. TradingView Tech Rating
  if (candidate.tvData) {
    const techRating = candidate.tvData[2]; // TechRating_1D index
    if (typeof techRating === "number") {
      score += techRating * weights.tvTechRating;
    }

    const rsi = candidate.tvData[8]; // RSI index
    if (typeof rsi === "number") {
      // Normalize RSI to [-1, 1]
      const normalizedRsi = (rsi - 50) / 50;
      score += normalizedRsi * weights.tvRsi;
    }
  }

  // 4. Traders Union
  if (candidate.tuData?.m15) {
    const m15 = candidate.tuData.m15;

    // Forecast
    if (m15.forecast === "buy") score += weights.tuForecast;
    else if (m15.forecast === "sell") score -= weights.tuForecast;

    // TA Balance
    const taBalance =
      (m15.ta.buy - m15.ta.sell) / (m15.ta.buy + m15.ta.sell + m15.ta.neutral);
    score += taBalance * weights.tuTaBalance;
  }

  return score; // Range approximately [-1, 1]
}
```

### 4.3 Prediction Output

```typescript
interface SmartMoneyPrediction {
  symbol: string;
  windowStart: number; // 15-min window timestamp
  direction: "UP" | "DOWN" | "NEUTRAL";
  confidence: number; // 0-100%
  score: number; // Raw weighted score
  signals: {
    lsRatio?: number;
    orderBookImbalance?: number;
    tvTechRating?: number;
    tvRsi?: number;
    tuForecast?: string;
  };
  entryPrice: number;
}
```

**Direction Thresholds:**

```typescript
if (score > 0.15) direction = "UP";
else if (score < -0.15) direction = "DOWN";
else direction = "NEUTRAL";

confidence = Math.min(100, Math.abs(score) * 100);
```

---

## 5. Accuracy Evaluation Stage (Future)

### 5.1 Evaluation Logic

После генерации prediction, следующий стейдж должен:

1. **Записать prediction** в ClickHouse с `status = 'pending'`
2. **Через 15 минут** (следующий tick):
   - Получить текущую цену
   - Сравнить с `entryPrice`
   - Определить `actual_direction`
   - Обновить `status = 'evaluated'`, `is_correct = true/false`

### 5.2 ClickHouse Schema

```sql
CREATE TABLE smart_money_predictions (
  id UUID DEFAULT generateUUIDv4(),
  symbol String,
  window_start DateTime,
  predicted_direction Enum8('UP' = 1, 'DOWN' = -1, 'NEUTRAL' = 0),
  confidence Float32,
  score Float32,
  entry_price Float64,
  exit_price Float64,
  actual_direction Enum8('UP' = 1, 'DOWN' = -1, 'NEUTRAL' = 0),
  is_correct UInt8,
  status Enum8('pending' = 0, 'evaluated' = 1),

  -- Signal breakdown for weight tuning
  signal_ls_ratio Float32,
  signal_book_imbalance Float32,
  signal_tv_rating Float32,
  signal_tv_rsi Float32,
  signal_tu_forecast String,

  created_at DateTime DEFAULT now()
)
ENGINE = MergeTree()
ORDER BY (symbol, window_start);
```

### 5.3 Weight Adjustment Algorithm

```typescript
// Периодически (daily/weekly) анализируем результаты
async function adjustWeights() {
  // 1. Получить все evaluated predictions за период
  const results = await clickhouse.query(`
    SELECT 
      symbol,
      predicted_direction,
      is_correct,
      signal_ls_ratio,
      signal_book_imbalance,
      signal_tv_rating
    FROM smart_money_predictions
    WHERE status = 'evaluated'
      AND created_at > now() - INTERVAL 7 DAY
  `);

  // 2. Для каждого сигнала рассчитать contribution to accuracy
  // Если signal_ls_ratio был high И prediction correct → increase weight
  // Если signal_ls_ratio был high И prediction wrong → decrease weight

  // 3. Gradient descent или простой reinforcement
  for (const signal of SIGNAL_KEYS) {
    const correctWithHighSignal = countCorrectWithHighSignal(results, signal);
    const wrongWithHighSignal = countWrongWithHighSignal(results, signal);

    const effectiveness =
      correctWithHighSignal / (correctWithHighSignal + wrongWithHighSignal);

    // Adjust weight based on effectiveness
    if (effectiveness > 0.55) {
      weights[signal] *= 1.05; // Increase by 5%
    } else if (effectiveness < 0.45) {
      weights[signal] *= 0.95; // Decrease by 5%
    }
  }

  // 4. Normalize weights to sum to 1
  normalizeWeights(weights);

  // 5. Persist new weights
  await saveWeights(weights);
}
```

---

## 6. Neural Network Architecture: Layered Weight System

По сути наша система — это **shallow neural network** с интерпретируемыми слоями:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         SMART MONEY PREDICTION NETWORK                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ╔═══════════════════════════════════════════════════════════════════════╗  │
│  ║                    LAYER 0: RAW INPUT SIGNALS                         ║  │
│  ╠═══════════════════════════════════════════════════════════════════════╣  │
│  ║  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐ ║  │
│  ║  │ L/S Ratio│ │ OrderBook│ │ TV Tech  │ │ Traders  │ │ Whale Trades │ ║  │
│  ║  │ [0.5-3.0]│ │ [-1, 1]  │ │ [-1, 1]  │ │ Union    │ │ [direction,  │ ║  │
│  ║  │          │ │          │ │ + RSI    │ │ m5/m15   │ │  size, price]│ ║  │
│  ║  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ └──────┬───────┘ ║  │
│  ╚═══════╪═══════════╪═══════════╪═══════════╪════════════════╪═════════╝  │
│          │           │           │           │                │            │
│          ▼           ▼           ▼           ▼                ▼            │
│  ╔═══════════════════════════════════════════════════════════════════════╗  │
│  ║                 LAYER 1: SIGNAL NORMALIZATION                         ║  │
│  ║                    (Activation: tanh-like)                            ║  │
│  ╠═══════════════════════════════════════════════════════════════════════╣  │
│  ║                                                                       ║  │
│  ║  f_ls(x) = { -1 if x > 1.5,  +1 if x < 0.67,  0 otherwise }          ║  │
│  ║  f_book(x) = clamp(x, -1, 1)                                          ║  │
│  ║  f_tv(rating, rsi) = rating * 0.7 + normalize(rsi) * 0.3             ║  │
│  ║  f_tu(forecast, ta) = direction_score + ta_balance                   ║  │
│  ║  f_whale(trades) = Σ (direction_i × WQS_i × TRS_i)                   ║  │
│  ║                                                                       ║  │
│  ║  Output: 5 normalized signals ∈ [-1, 1]                              ║  │
│  ╚═══════════════════════════════════════════════════════════════════════╝  │
│          │           │           │           │                │            │
│          ▼           ▼           ▼           ▼                ▼            │
│  ╔═══════════════════════════════════════════════════════════════════════╗  │
│  ║              LAYER 2: SOURCE × SYMBOL WEIGHT MATRIX                   ║  │
│  ║                  (Learnable parameters: 4×4 = 16)                     ║  │
│  ╠═══════════════════════════════════════════════════════════════════════╣  │
│  ║                                                                       ║  │
│  ║              │ BTCUSDT │ ETHUSDT │ SOLUSDT │ XRPUSDT │                ║  │
│  ║  ────────────┼─────────┼─────────┼─────────┼─────────┤                ║  │
│  ║  binance-ls  │  0.25   │  0.30   │  0.20   │  0.15   │                ║  │
│  ║  tradingview │  0.30   │  0.25   │  0.25   │  0.20   │                ║  │
│  ║  traders-un  │  0.20   │  0.15   │  0.15   │  0.25   │                ║  │
│  ║  whale-sig   │  0.25   │  0.30   │  0.40   │  0.40   │                ║  │
│  ║                                                                       ║  │
│  ║  W_source[s][sym] ∈ [0.1, 0.5], Σ per symbol ≈ 1.0                   ║  │
│  ╚═══════════════════════════════════════════════════════════════════════╝  │
│          │           │           │           │                │            │
│          ▼           ▼           ▼           ▼                ▼            │
│  ╔═══════════════════════════════════════════════════════════════════════╗  │
│  ║               LAYER 3: PER-WHALE WEIGHT MATRIX                        ║  │
│  ║              (Learnable parameters: N_whales × 4)                     ║  │
│  ╠═══════════════════════════════════════════════════════════════════════╣  │
│  ║                                                                       ║  │
│  ║  ┌─────────────────────────────────────────────────────────────────┐  ║  │
│  ║  │ Whale Wallet     │ BTC   │ ETH   │ SOL   │ XRP   │ Global WQS  │  ║  │
│  ║  ├──────────────────┼───────┼───────┼───────┼───────┼─────────────┤  ║  │
│  ║  │ 0x1234...abcd    │ 1.45  │ 1.20  │ 0.80  │ 1.00  │ 0.85        │  ║  │
│  ║  │ 0x5678...efgh    │ 0.90  │ 1.60  │ 1.35  │ 0.70  │ 0.72        │  ║  │
│  ║  │ 0x9abc...ijkl    │ 1.10  │ 0.95  │ 1.80  │ 1.50  │ 0.91        │  ║  │
│  ║  │ ...              │ ...   │ ...   │ ...   │ ...   │ ...         │  ║  │
│  ║  └─────────────────────────────────────────────────────────────────┘  ║  │
│  ║                                                                       ║  │
│  ║  W_whale[wallet][sym] ∈ [0.3, 2.0]                                   ║  │
│  ║  Updated via: EWMA(accuracy) with regularization                     ║  │
│  ╚═══════════════════════════════════════════════════════════════════════╝  │
│          │           │           │           │                │            │
│          ▼           ▼           ▼           ▼                ▼            │
│  ╔═══════════════════════════════════════════════════════════════════════╗  │
│  ║                LAYER 4: SIGNAL AGGREGATION                            ║  │
│  ║                   (Weighted Sum + Normalization)                      ║  │
│  ╠═══════════════════════════════════════════════════════════════════════╣  │
│  ║                                                                       ║  │
│  ║  For symbol s:                                                        ║  │
│  ║                                                                       ║  │
│  ║  technical_score = Σ (signal_i × W_source[i][s])                     ║  │
│  ║                    i∈{ls, tv, tu}                                     ║  │
│  ║                                                                       ║  │
│  ║  whale_consensus = Σ (direction_j × WQS_j × TRS_j × W_whale[j][s])   ║  │
│  ║                    j∈active_whales                                    ║  │
│  ║                  / Σ (WQS_j × TRS_j × W_whale[j][s])                  ║  │
│  ║                                                                       ║  │
│  ║  final_score = technical_score + whale_consensus × W_source[whale][s]║  │
│  ║                                                                       ║  │
│  ║  Output: score ∈ [-1.5, 1.5] approximately                           ║  │
│  ╚═══════════════════════════════════════════════════════════════════════╝  │
│                                    │                                        │
│                                    ▼                                        │
│  ╔═══════════════════════════════════════════════════════════════════════╗  │
│  ║                 LAYER 5: DECISION THRESHOLD                           ║  │
│  ║                    (Activation: step function)                        ║  │
│  ╠═══════════════════════════════════════════════════════════════════════╣  │
│  ║                                                                       ║  │
│  ║                      ┌───────────────────┐                            ║  │
│  ║                      │   θ_up = 0.12     │                            ║  │
│  ║                      │   θ_down = -0.12  │                            ║  │
│  ║                      └─────────┬─────────┘                            ║  │
│  ║                                │                                      ║  │
│  ║         ┌──────────────────────┼──────────────────────┐               ║  │
│  ║         │                      │                      │               ║  │
│  ║         ▼                      ▼                      ▼               ║  │
│  ║   ┌──────────┐          ┌──────────┐          ┌──────────┐            ║  │
│  ║   │score>θ_up│          │ neutral  │          │score<θ_dn│            ║  │
│  ║   │   = UP   │          │ = HOLD   │          │  = DOWN  │            ║  │
│  ║   └──────────┘          └──────────┘          └──────────┘            ║  │
│  ║                                                                       ║  │
│  ║   confidence = min(100, |score| × 100)                               ║  │
│  ╚═══════════════════════════════════════════════════════════════════════╝  │
│                                    │                                        │
│                                    ▼                                        │
│  ╔═══════════════════════════════════════════════════════════════════════╗  │
│  ║                      OUTPUT: PREDICTION                               ║  │
│  ╠═══════════════════════════════════════════════════════════════════════╣  │
│  ║   {                                                                   ║  │
│  ║     symbol: "BTCUSDT",                                                ║  │
│  ║     direction: "UP" | "DOWN" | "NEUTRAL",                             ║  │
│  ║     confidence: 0-100,                                                ║  │
│  ║     score: -1.5 to 1.5,                                               ║  │
│  ║     breakdown: { technical, whale_consensus, contributing_whales }    ║  │
│  ║   }                                                                   ║  │
│  ╚═══════════════════════════════════════════════════════════════════════╝  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 6.1 Layer Parameters Summary

| Layer             | Parameters                 | Learnable      | Update Frequency |
| ----------------- | -------------------------- | -------------- | ---------------- |
| L0: Input         | -                          | No             | Real-time        |
| L1: Normalization | Scaling factors            | No (hardcoded) | -                |
| L2: Source×Symbol | 4 sources × 4 symbols = 16 | Yes            | Every 6 hours    |
| L3: Whale×Symbol  | N_whales × 4 symbols ≈ 400 | Yes            | Every 6 hours    |
| L4: Aggregation   | -                          | No             | -                |
| L5: Threshold     | θ_up, θ_down = 2           | Yes (tunable)  | Weekly           |

**Total learnable parameters:** ~420 (scalable with whale count)

### 6.2 Asynchronous Input Handling (Layer 0.5)

Критическая проблема: **данные приходят не синхронно!**

```
Timeline (15 min window):
─────────────────────────────────────────────────────────────────────────────►
│ t=0                                                              t=15min  │
│                                                                    ▼      │
│  Order Books:  ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●  │
│                (every 100ms = ~9000 updates per window)                   │
│                                                                           │
│  Binance L/S:  ●     ●     ●     ●     ●     ●     ●     ●     ●     ●   │
│                (every 1 min = 15 updates per window)                      │
│                                                                           │
│  TradingView:  ●                                                          │
│                (every 15 min = 1 update per window, at start!)            │
│                                                                           │
│  Traders Union:●                                                          │
│                (every 15 min = 1 update per window)                       │
│                                                                           │
│  Whale Trades: ●        ●  ●                        ●                     │
│                (event-driven = 0-20 trades per window)                    │
─────────────────────────────────────────────────────────────────────────────►
```

**Проблемы:**

1. **Stale Data**: TradingView данные могут быть 14 минут старыми к моменту prediction
2. **Missing Data**: Whale trades могут отсутствовать в текущем окне
3. **Over-representation**: Order book имеет 9000x больше апдейтов чем TradingView

**Решение: Signal Freshness Layer (L0.5)**

```typescript
interface SignalWithMetadata {
  value: number; // Actual signal value
  timestamp: number; // When signal was received
  age: number; // Seconds since last update (computed at inference time)
  freshnessScore: number; // 0.0 - 1.0 penalty based on age
  source: string;
  isStale: boolean; // True if older than maxAge
}

interface SignalFreshnessConfig {
  source: string;
  maxAge: number; // Seconds after which signal is considered stale
  halfLife: number; // Seconds for freshness to decay to 0.5
  requireFresh: boolean; // If true, stale signal = 0 weight
}

const FRESHNESS_CONFIG: Record<string, SignalFreshnessConfig> = {
  "binance-ls": {
    maxAge: 120, // 2 min max staleness
    halfLife: 60, // 1 min half-life
    requireFresh: false, // Use with penalty
  },
  orderbook: {
    maxAge: 5, // 5 sec max staleness
    halfLife: 2, // 2 sec half-life (decays fast)
    requireFresh: true, // MUST be fresh for orderbook imbalance
  },
  tradingview: {
    maxAge: 900, // 15 min max (entire window)
    halfLife: 450, // 7.5 min half-life
    requireFresh: false, // OK to use slightly old data
  },
  "traders-union": {
    maxAge: 900,
    halfLife: 450,
    requireFresh: false,
  },
  "whale-signals": {
    maxAge: 900, // Whale trade valid for entire window
    halfLife: 300, // 5 min half-life (recent trades matter more)
    requireFresh: false,
  },
};

function calculateFreshnessScore(
  signalTimestamp: number,
  inferenceTimestamp: number,
  config: SignalFreshnessConfig,
): number {
  const age = (inferenceTimestamp - signalTimestamp) / 1000; // seconds

  // Check if completely stale
  if (age > config.maxAge) {
    return config.requireFresh ? 0 : 0.1; // Minimal weight if stale
  }

  // Exponential decay: freshness = 0.5^(age / halfLife)
  const freshness = Math.pow(0.5, age / config.halfLife);

  return freshness;
}
```

**Data Structure with Timestamps:**

```typescript
interface SmartMoneyCandidateV2 {
  symbol: string;

  // Each signal carries its timestamp
  signals: {
    lsRatio: SignalWithMetadata | null;
    orderBook: SignalWithMetadata | null;
    tvTech: SignalWithMetadata | null;
    tradersUnion: SignalWithMetadata | null;
  };

  // Whale trades are naturally timestamped
  whaleSignals: Array<{
    wallet: string;
    direction: "UP" | "DOWN";
    score: number;
    timestamp: number;
    freshnessScore: number;
  }>;

  // Metadata
  predictionTimestamp: number;
  dataCompleteness: number; // 0-100% how many signals are fresh
}
```

**Modified Forward Pass with Freshness:**

```typescript
function forwardPassWithFreshness(
  input: SmartMoneyCandidateV2,
  weights: NetworkWeights,
  inferenceTime: number,
): NetworkOutput {
  const sym = input.symbol;

  // ═══════════════════════════════════════════════════════════
  // LAYER 0.5: Freshness Scoring
  // ═══════════════════════════════════════════════════════════
  const L05 = {
    ls: input.signals.lsRatio
      ? calculateFreshnessScore(
          input.signals.lsRatio.timestamp,
          inferenceTime,
          FRESHNESS_CONFIG["binance-ls"],
        )
      : 0,
    book: input.signals.orderBook
      ? calculateFreshnessScore(
          input.signals.orderBook.timestamp,
          inferenceTime,
          FRESHNESS_CONFIG["orderbook"],
        )
      : 0,
    tv: input.signals.tvTech
      ? calculateFreshnessScore(
          input.signals.tvTech.timestamp,
          inferenceTime,
          FRESHNESS_CONFIG["tradingview"],
        )
      : 0,
    tu: input.signals.tradersUnion
      ? calculateFreshnessScore(
          input.signals.tradersUnion.timestamp,
          inferenceTime,
          FRESHNESS_CONFIG["traders-union"],
        )
      : 0,
  };

  // Calculate data completeness
  const freshnessValues = Object.values(L05);
  const dataCompleteness =
    freshnessValues.reduce((a, b) => a + b, 0) / freshnessValues.length;

  // ═══════════════════════════════════════════════════════════
  // LAYER 1: Normalization (now with null checks)
  // ═══════════════════════════════════════════════════════════
  const L1 = {
    ls: input.signals.lsRatio ? normalizeLS(input.signals.lsRatio.value) : 0,
    book: input.signals.orderBook ? input.signals.orderBook.value : 0,
    tv: input.signals.tvTech ? input.signals.tvTech.value : 0,
    tu: input.signals.tradersUnion ? input.signals.tradersUnion.value : 0,
  };

  // ═══════════════════════════════════════════════════════════
  // LAYER 2: Source × Symbol × Freshness Weighting
  // ═══════════════════════════════════════════════════════════
  // Now multiply by freshness score!
  const L2 = {
    ls: L1.ls * weights.source["binance-ls"][sym] * L05.ls,
    book: L1.book * weights.source["orderbook"][sym] * L05.book,
    tv: L1.tv * weights.source["tradingview"][sym] * L05.tv,
    tu: L1.tu * weights.source["traders-union"][sym] * L05.tu,
  };

  // ═══════════════════════════════════════════════════════════
  // LAYER 3: Whale Weighting with Time Decay
  // ═══════════════════════════════════════════════════════════
  let whaleNumerator = 0;
  let whaleDenominator = 0;

  for (const ws of input.whaleSignals) {
    // Calculate freshness for this specific trade
    const whaleFreshness = calculateFreshnessScore(
      ws.timestamp,
      inferenceTime,
      FRESHNESS_CONFIG["whale-signals"],
    );

    // Skip if too old and require fresh
    if (whaleFreshness < 0.1) continue;

    const whaleWeight = weights.whale[ws.wallet]?.[sym] ?? 1.0;
    const contribution = ws.score * whaleWeight * whaleFreshness;

    const direction = ws.direction === "UP" ? 1 : -1;
    whaleNumerator += direction * contribution;
    whaleDenominator += contribution;
  }

  const L3_whaleConsensus =
    whaleDenominator > 0 ? whaleNumerator / whaleDenominator : 0;

  // Penalize whale signal if few recent trades
  const activeWhaleCount = input.whaleSignals.filter(
    (ws) =>
      calculateFreshnessScore(
        ws.timestamp,
        inferenceTime,
        FRESHNESS_CONFIG["whale-signals"],
      ) > 0.3,
  ).length;

  const whaleConfidenceMultiplier = Math.min(1, activeWhaleCount / 3);

  // ═══════════════════════════════════════════════════════════
  // LAYER 4: Aggregation with Dynamic Normalization
  // ═══════════════════════════════════════════════════════════
  const technicalScore = L2.ls + L2.book + L2.tv + L2.tu;

  // Normalize by sum of active freshness scores to avoid under-weighting
  const totalFreshness = L05.ls + L05.book + L05.tv + L05.tu;
  const normalizedTechnical =
    totalFreshness > 0 ? technicalScore / totalFreshness : 0;

  const whaleContribution =
    L3_whaleConsensus *
    weights.source["whale-signals"][sym] *
    whaleConfidenceMultiplier;

  const L4_score = normalizedTechnical + whaleContribution;

  // ═══════════════════════════════════════════════════════════
  // LAYER 5: Decision with Completeness Check
  // ═══════════════════════════════════════════════════════════
  // Lower confidence if data is incomplete
  const completenessMultiplier = Math.pow(dataCompleteness, 0.5);

  let direction: "UP" | "DOWN" | "NEUTRAL";
  if (L4_score > weights.threshold.up) direction = "UP";
  else if (L4_score < weights.threshold.down) direction = "DOWN";
  else direction = "NEUTRAL";

  const rawConfidence = Math.min(100, Math.abs(L4_score) * 100);
  const confidence = rawConfidence * completenessMultiplier;

  return {
    direction,
    confidence,
    score: L4_score,
    dataCompleteness,
    layerOutputs: {
      L05_freshness: L05,
      L1_normalized: L1,
      L2_weighted: L2,
      L3_whaleConsensus: L3_whaleConsensus,
      L4_aggregated: L4_score,
      activeWhales: activeWhaleCount,
    },
  };
}
```

**Aggregation Strategies for High-Frequency Data:**

```typescript
// For Order Book: Use LATEST value (most recent wins)
function aggregateOrderBook(updates: OrderBookUpdate[]): SignalWithMetadata {
  const latest = updates[updates.length - 1];
  return {
    value: latest.imbalance,
    timestamp: latest.timestamp,
    age: 0,
    freshnessScore: 1.0,
    source: 'orderbook',
    isStale: false,
  };
}

// For Binance L/S: Use TIME-WEIGHTED AVERAGE over window
function aggregateLSRatio(updates: LSUpdate[], windowStart: number): SignalWithMetadata {
  if (updates.length === 0) return null;

  let weightedSum = 0;
  let totalWeight = 0;

  for (const update of updates) {
    // More recent updates get higher weight
    const age = (Date.now() - update.timestamp) / 1000;
    const weight = Math.pow(0.5, age / 300); // 5 min half-life

    weightedSum += update.ratio * weight;
    totalWeight += weight;
  }

  return {
    value: totalWeight > 0 ? weightedSum / totalWeight : updates[0].ratio,
    timestamp: updates[updates.length - 1].timestamp,
    age: (Date.now() - updates[updates.length - 1].timestamp) / 1000,
    freshnessScore: calculateFreshnessScore(...),
    source: 'binance-ls',
    isStale: false,
  };
}

// For Whale Trades: ACCUMULATE with decay
function aggregateWhaleSignals(
  trades: WhaleTrade[],
  inferenceTime: number
): WhaleSignalWithFreshness[] {
  return trades.map(trade => {
    const freshness = calculateFreshnessScore(
      trade.timestamp,
      inferenceTime,
      FRESHNESS_CONFIG['whale-signals']
    );

    return {
      wallet: trade.wallet,
      direction: trade.direction,
      score: trade.signalScore * freshness, // Pre-apply decay
      timestamp: trade.timestamp,
      freshnessScore: freshness,
    };
  }).filter(ws => ws.freshnessScore > 0.1); // Remove very stale
}
```

**Missing Data Handling:**

```typescript
interface DataAvailabilityCheck {
  hasLS: boolean;
  hasOrderBook: boolean;
  hasTV: boolean;
  hasTU: boolean;
  hasWhales: boolean;
  completeness: number;
  canPredict: boolean;
}

function checkDataAvailability(
  candidate: SmartMoneyCandidateV2,
): DataAvailabilityCheck {
  const hasLS =
    candidate.signals.lsRatio !== null &&
    candidate.signals.lsRatio.freshnessScore > 0.3;
  const hasOrderBook =
    candidate.signals.orderBook !== null &&
    candidate.signals.orderBook.freshnessScore > 0.5;
  const hasTV = candidate.signals.tvTech !== null; // TV ok to be older
  const hasTU = candidate.signals.tradersUnion !== null;
  const hasWhales = candidate.whaleSignals.length > 0;

  // Count available signals
  const available = [hasLS, hasOrderBook, hasTV, hasTU, hasWhales].filter(
    Boolean,
  ).length;
  const completeness = available / 5;

  // Minimum requirement: at least 2 technical signals OR 1 technical + whales
  const canPredict = available >= 2 || (hasWhales && available >= 1);

  return {
    hasLS,
    hasOrderBook,
    hasTV,
    hasTU,
    hasWhales,
    completeness,
    canPredict,
  };
}

function maybeSkipPrediction(availability: DataAvailabilityCheck): boolean {
  if (!availability.canPredict) {
    logger.warn(
      { availability },
      "Insufficient data for prediction, skipping window",
    );
    return true;
  }

  if (availability.completeness < 0.4) {
    logger.warn(
      { completeness: availability.completeness },
      "Low data completeness, prediction will have reduced confidence",
    );
  }

  return false;
}
```

### 6.3 Forward Pass (Inference)

```typescript
interface NetworkInput {
  symbol: string;
  signals: {
    lsRatio: number;
    orderBookImbalance: number;
    tvTechRating: number;
    tvRsi: number;
    tuForecast: string;
    tuTaBalance: number;
  };
  whaleSignals: WhaleSignal[];
}

interface NetworkOutput {
  direction: "UP" | "DOWN" | "NEUTRAL";
  confidence: number;
  score: number;
  layerOutputs: {
    L1_normalized: number[];
    L2_weighted: number[];
    L3_whaleWeighted: number;
    L4_aggregated: number;
  };
}

function forwardPass(
  input: NetworkInput,
  weights: NetworkWeights,
): NetworkOutput {
  const sym = input.symbol;

  // ═══════════════════════════════════════════════════════════
  // LAYER 1: Normalization
  // ═══════════════════════════════════════════════════════════
  const L1 = {
    ls: normalizeLS(input.signals.lsRatio), // → [-1, 1]
    book: input.signals.orderBookImbalance, // already [-1, 1]
    tv: normalizeTVSignal(input.signals.tvTechRating, input.signals.tvRsi),
    tu: normalizeTUSignal(input.signals.tuForecast, input.signals.tuTaBalance),
  };

  // ═══════════════════════════════════════════════════════════
  // LAYER 2: Source × Symbol Weighting
  // ═══════════════════════════════════════════════════════════
  const L2 = {
    ls: L1.ls * weights.source["binance-ls"][sym],
    book: L1.book * weights.source["orderbook"][sym],
    tv: L1.tv * weights.source["tradingview"][sym],
    tu: L1.tu * weights.source["traders-union"][sym],
  };

  // ═══════════════════════════════════════════════════════════
  // LAYER 3: Per-Whale Weighting
  // ═══════════════════════════════════════════════════════════
  let whaleNumerator = 0;
  let whaleDenominator = 0;

  for (const ws of input.whaleSignals) {
    // Skip low-quality signals
    if (ws.signalScore < MIN_SIGNAL_THRESHOLD) continue;

    const whaleWeight = weights.whale[ws.wallet]?.[sym] ?? 1.0;
    const contribution = ws.signalScore * whaleWeight;

    const direction = ws.direction === "UP" ? 1 : -1;
    whaleNumerator += direction * contribution;
    whaleDenominator += contribution;
  }

  const L3_whaleConsensus =
    whaleDenominator > 0 ? whaleNumerator / whaleDenominator : 0;

  // ═══════════════════════════════════════════════════════════
  // LAYER 4: Aggregation
  // ═══════════════════════════════════════════════════════════
  const technicalScore = L2.ls + L2.book + L2.tv + L2.tu;
  const whaleContribution =
    L3_whaleConsensus * weights.source["whale-signals"][sym];

  const L4_score = technicalScore + whaleContribution;

  // ═══════════════════════════════════════════════════════════
  // LAYER 5: Decision
  // ═══════════════════════════════════════════════════════════
  let direction: "UP" | "DOWN" | "NEUTRAL";
  if (L4_score > weights.threshold.up) direction = "UP";
  else if (L4_score < weights.threshold.down) direction = "DOWN";
  else direction = "NEUTRAL";

  const confidence = Math.min(100, Math.abs(L4_score) * 100);

  return {
    direction,
    confidence,
    score: L4_score,
    layerOutputs: {
      L1_normalized: [L1.ls, L1.book, L1.tv, L1.tu],
      L2_weighted: [L2.ls, L2.book, L2.tv, L2.tu],
      L3_whaleWeighted: L3_whaleConsensus,
      L4_aggregated: L4_score,
    },
  };
}
```

### 6.3 Backward Pass (Learning)

```typescript
interface TrainingExample {
  input: NetworkInput;
  actualDirection: "UP" | "DOWN";
  priceChange: number; // % change after 15 min
}

async function backwardPass(
  example: TrainingExample,
  weights: NetworkWeights,
  learningRate: number = 0.05,
): Promise<NetworkWeights> {
  // Forward pass to get predictions and layer outputs
  const output = forwardPass(example.input, weights);

  // Calculate error
  const actualScore = example.actualDirection === "UP" ? 1 : -1;
  const error = actualScore - output.score;

  // Only update if prediction was wrong
  if (
    (output.direction === "UP" && example.actualDirection !== "UP") ||
    (output.direction === "DOWN" && example.actualDirection !== "DOWN")
  ) {
    const sym = example.input.symbol;

    // ═══════════════════════════════════════════════════════════
    // UPDATE LAYER 2: Source Weights
    // ═══════════════════════════════════════════════════════════
    // If signal was in wrong direction, decrease its weight
    // If signal was in right direction, increase its weight

    const L1 = output.layerOutputs.L1_normalized;
    const signalContributions = [
      "binance-ls",
      "orderbook",
      "tradingview",
      "traders-union",
    ];

    for (let i = 0; i < signalContributions.length; i++) {
      const sourceId = signalContributions[i];
      const signalValue = L1[i];

      // Gradient: how much did this signal contribute to error?
      // If signal was positive and we should have gone DOWN, decrease weight
      // If signal was negative and we should have gone UP, decrease weight
      const gradient = signalValue * error;

      // Update weight
      weights.source[sourceId][sym] += learningRate * gradient;

      // Clamp to valid range
      weights.source[sourceId][sym] = Math.max(
        0.05,
        Math.min(0.6, weights.source[sourceId][sym]),
      );
    }

    // ═══════════════════════════════════════════════════════════
    // UPDATE LAYER 3: Whale Weights
    // ═══════════════════════════════════════════════════════════
    for (const ws of example.input.whaleSignals) {
      const whaleDirection = ws.direction === "UP" ? 1 : -1;
      const wasCorrect = whaleDirection === actualScore;

      // Initialize if needed
      if (!weights.whale[ws.wallet]) {
        weights.whale[ws.wallet] = { [sym]: 1.0 };
      }
      if (!weights.whale[ws.wallet][sym]) {
        weights.whale[ws.wallet][sym] = 1.0;
      }

      // Update whale weight
      if (wasCorrect) {
        weights.whale[ws.wallet][sym] *= 1 + learningRate;
      } else {
        weights.whale[ws.wallet][sym] *= 1 - learningRate;
      }

      // Clamp
      weights.whale[ws.wallet][sym] = Math.max(
        0.3,
        Math.min(2.0, weights.whale[ws.wallet][sym]),
      );
    }

    // ═══════════════════════════════════════════════════════════
    // UPDATE LAYER 5: Thresholds (less frequent)
    // ═══════════════════════════════════════════════════════════
    // If we predicted NEUTRAL but should have acted, tighten thresholds
    // If we predicted wrong direction, consider widening thresholds
    if (output.direction === "NEUTRAL") {
      weights.threshold.up *= 0.99;
      weights.threshold.down *= 0.99;
    }
  }

  // Normalize source weights per symbol to sum to ~1
  normalizeSourceWeights(weights.source, sym);

  return weights;
}

function normalizeSourceWeights(
  source: Record<string, Record<string, number>>,
  sym: string,
) {
  const sources = Object.keys(source);
  const sum = sources.reduce((acc, s) => acc + source[s][sym], 0);

  if (sum > 0) {
    for (const s of sources) {
      source[s][sym] /= sum;
    }
  }
}
```

### 6.4 Training Loop

```typescript
async function trainNetwork(
  trainingData: TrainingExample[],
  initialWeights: NetworkWeights,
  epochs: number = 10,
  learningRate: number = 0.05,
): Promise<{ weights: NetworkWeights; metrics: TrainingMetrics }> {
  let weights = structuredClone(initialWeights);
  const metrics: TrainingMetrics = {
    epochAccuracy: [],
    lossHistory: [],
  };

  for (let epoch = 0; epoch < epochs; epoch++) {
    let correct = 0;
    let total = 0;
    let totalLoss = 0;

    // Shuffle training data each epoch
    const shuffled = shuffleArray(trainingData);

    for (const example of shuffled) {
      // Forward pass
      const output = forwardPass(example.input, weights);

      // Calculate accuracy
      if (output.direction === example.actualDirection) {
        correct++;
      }
      total++;

      // Calculate loss (MSE between score and target)
      const target = example.actualDirection === "UP" ? 1 : -1;
      const loss = Math.pow(output.score - target, 2);
      totalLoss += loss;

      // Backward pass (update weights)
      weights = await backwardPass(example, weights, learningRate);
    }

    metrics.epochAccuracy.push(correct / total);
    metrics.lossHistory.push(totalLoss / total);

    logger.info(
      {
        epoch: epoch + 1,
        accuracy: ((correct / total) * 100).toFixed(2) + "%",
        avgLoss: (totalLoss / total).toFixed(4),
      },
      "Training epoch completed",
    );

    // Early stopping if accuracy is high enough
    if (correct / total > 0.65) {
      logger.info("Early stopping: target accuracy reached");
      break;
    }

    // Decay learning rate
    learningRate *= 0.95;
  }

  return { weights, metrics };
}
```

### 6.5 Weight Initialization Strategies

```typescript
interface WeightInitStrategy {
  name: string;
  initialize: () => NetworkWeights;
}

const INIT_STRATEGIES: WeightInitStrategy[] = [
  {
    name: "uniform",
    initialize: () => ({
      source: {
        "binance-ls": {
          BTCUSDT: 0.25,
          ETHUSDT: 0.25,
          SOLUSDT: 0.25,
          XRPUSDT: 0.25,
        },
        orderbook: {
          BTCUSDT: 0.25,
          ETHUSDT: 0.25,
          SOLUSDT: 0.25,
          XRPUSDT: 0.25,
        },
        tradingview: {
          BTCUSDT: 0.25,
          ETHUSDT: 0.25,
          SOLUSDT: 0.25,
          XRPUSDT: 0.25,
        },
        "traders-union": {
          BTCUSDT: 0.25,
          ETHUSDT: 0.25,
          SOLUSDT: 0.25,
          XRPUSDT: 0.25,
        },
        "whale-signals": {
          BTCUSDT: 0.25,
          ETHUSDT: 0.25,
          SOLUSDT: 0.25,
          XRPUSDT: 0.25,
        },
      },
      whale: {}, // All whales start at 1.0
      threshold: { up: 0.12, down: -0.12 },
    }),
  },
  {
    name: "xavier",
    initialize: () => {
      // Xavier initialization: weights ~ N(0, 1/n_inputs)
      const n_inputs = 5; // Number of signal sources
      const std = 1 / Math.sqrt(n_inputs);

      const randomWeight = () => 0.2 + Math.random() * std;

      return {
        source: {
          "binance-ls": {
            BTCUSDT: randomWeight(),
            ETHUSDT: randomWeight(),
            SOLUSDT: randomWeight(),
            XRPUSDT: randomWeight(),
          },
          // ... similarly for other sources
        },
        whale: {},
        threshold: { up: 0.12, down: -0.12 },
      };
    },
  },
  {
    name: "domain-expert",
    initialize: () => ({
      // Based on domain knowledge about signal reliability
      source: {
        "binance-ls": {
          BTCUSDT: 0.25,
          ETHUSDT: 0.3,
          SOLUSDT: 0.2,
          XRPUSDT: 0.15,
        },
        orderbook: { BTCUSDT: 0.1, ETHUSDT: 0.1, SOLUSDT: 0.15, XRPUSDT: 0.1 },
        tradingview: {
          BTCUSDT: 0.3,
          ETHUSDT: 0.25,
          SOLUSDT: 0.25,
          XRPUSDT: 0.2,
        },
        "traders-union": {
          BTCUSDT: 0.15,
          ETHUSDT: 0.1,
          SOLUSDT: 0.1,
          XRPUSDT: 0.2,
        },
        "whale-signals": {
          BTCUSDT: 0.2,
          ETHUSDT: 0.25,
          SOLUSDT: 0.3,
          XRPUSDT: 0.35,
        },
      },
      whale: {},
      threshold: { up: 0.12, down: -0.12 },
    }),
  },
];
```

### 6.6 Regularization Techniques

```typescript
// L2 Regularization (Weight Decay)
function applyL2Regularization(weights: NetworkWeights, lambda: number = 0.01) {
  for (const source of Object.keys(weights.source)) {
    for (const sym of Object.keys(weights.source[source])) {
      // Push weights towards mean (0.2)
      const diff = weights.source[source][sym] - 0.2;
      weights.source[source][sym] -= lambda * diff;
    }
  }

  for (const wallet of Object.keys(weights.whale)) {
    for (const sym of Object.keys(weights.whale[wallet])) {
      // Push whale weights towards 1.0
      const diff = weights.whale[wallet][sym] - 1.0;
      weights.whale[wallet][sym] -= lambda * diff;
    }
  }
}

// Dropout (for training robustness)
function applyDropout(
  weights: NetworkWeights,
  dropRate: number = 0.1,
): NetworkWeights {
  const dropped = structuredClone(weights);

  // Randomly zero out some source weights during training
  for (const source of Object.keys(dropped.source)) {
    for (const sym of Object.keys(dropped.source[source])) {
      if (Math.random() < dropRate) {
        dropped.source[source][sym] = 0;
      }
    }
  }

  return dropped;
}

// Confidence-based Sample Weighting
function getSampleWeight(example: TrainingExample): number {
  // Higher weight for examples with clear directional moves
  const absChange = Math.abs(example.priceChange);

  if (absChange > 2.0) return 2.0; // Strong move, learn more
  if (absChange > 1.0) return 1.5; // Moderate move
  if (absChange > 0.5) return 1.0; // Normal
  return 0.5; // Noise, learn less
}
```

---

## 7. Implementation Plan

### Phase 1: Fix Memory Leak (CRITICAL)

- [ ] Modify `SmartMoneyPredictionStage` to NOT emit on every update
- [ ] Only emit on `interval-ticker-source` events
- [ ] Add `ALLOWED_SYMBOLS` filter

### Phase 2: Implement Network Layers

- [ ] Create `NetworkWeights` interface with Layer 2 and Layer 3 structures
- [ ] Implement `forwardPass()` function
- [ ] Create weight storage in ClickHouse

### Phase 3: Add Scoring Stage

- [ ] Implement `calculatePredictionScore()` with weighted signals
- [ ] Emit `SmartMoneyPrediction` objects instead of raw state
- [ ] Store layer outputs for debugging

### Phase 4: Storage & Evaluation

- [ ] Create `smart_money_predictions` table in ClickHouse
- [ ] Create `SmartMoneyStorageStage` to persist predictions
- [ ] Create `SmartMoneyEvaluatorStage` for outcome tracking

### Phase 5: Training Pipeline

- [ ] Implement `backwardPass()` for weight updates
- [ ] Create training loop with regularization
- [ ] Setup cron job for periodic weight optimization

### Phase 6: Monitoring & A/B Testing

- [ ] Create dashboard to monitor layer activations
- [ ] Implement A/B test framework for weight configurations
- [ ] Add alerting for accuracy degradation

---

## 8. Expected Outcomes

| Metric               | Target                 | Notes                    |
| -------------------- | ---------------------- | ------------------------ |
| Prediction Frequency | 4 predictions / 15 min | One per allowed symbol   |
| Data Volume          | ~50 KB / 15 min        | Down from ~900 MB!       |
| Initial Winrate      | ~50%                   | Random baseline          |
| Target Winrate (3mo) | 55-60%                 | With weight optimization |

---

## 9. Risks and Mitigations

### 9.1 Проблема: Не все киты одинаково полезны

Текущий pipeline трекает **всех** crypto leaders с Polymarket. Но:

- Топ-10 трейдеров имеют **исторический PnL** и высокий rank
- Трейдеры 50-100 могут быть случайными везунчиками
- Некоторые киты делают **хедж-сделки** (не directional)
- Мелкие сделки ($100-500) часто "noise"

**Гипотеза:** Фильтрация сделок по качеству кита и размеру позиции поднимет winrate с 50% до 55-60%.

### 9.2 Whale Quality Score (WQS)

Каждому киту присваивается динамический **Quality Score**:

```typescript
interface WhaleQualityMetrics {
  // Static (from leaderboard)
  rank: number; // 1-100
  historicalPnl: number; // Cumulative PnL in USD

  // Dynamic (calculated)
  recentWinrate: number; // Last 20 trades winrate
  avgTradeSize: number; // Average position size
  tradeFrequency: number; // Trades per day
  consistencyScore: number; // Variance in trade sizes
}

function calculateWQS(whale: WhaleQualityMetrics): number {
  let score = 0;

  // 1. Rank Score (Top 10 = 1.0, Top 50 = 0.5, 50+ = 0.2)
  if (whale.rank <= 10) score += 0.3;
  else if (whale.rank <= 25) score += 0.2;
  else if (whale.rank <= 50) score += 0.1;
  else score += 0.05;

  // 2. Historical PnL (normalized)
  // Top performers have $100k+ PnL
  const pnlNorm = Math.min(1, whale.historicalPnl / 100000);
  score += pnlNorm * 0.25;

  // 3. Recent Winrate
  // 60%+ is strong signal
  if (whale.recentWinrate > 0.65) score += 0.25;
  else if (whale.recentWinrate > 0.55) score += 0.15;
  else if (whale.recentWinrate > 0.5) score += 0.05;
  // Below 50% = no bonus

  // 4. Trade Size Consistency
  // Erratic sizing = hedging or uncertain
  score += (1 - whale.consistencyScore) * 0.1;

  // 5. Frequency Penalty
  // Too many trades = noise; optimal = 5-15/day
  if (whale.tradeFrequency >= 5 && whale.tradeFrequency <= 15) {
    score += 0.1;
  } else if (whale.tradeFrequency > 30) {
    score -= 0.05; // Overtrading penalty
  }

  return Math.max(0, Math.min(1, score)); // Clamp to [0, 1]
}
```

### 9.3 Trade Relevance Score (TRS)

Не все сделки кита одинаково важны:

```typescript
interface TradeContext {
  sizeUsd: number; // Trade size in USD
  priceLevel: number; // 0-1 Polymarket price (confidence)
  timeSinceLastTrade: number; // Minutes
  isFirstTradeInWindow: boolean;
  symbolMatch: boolean; // Is this the whale's "specialty"?
}

function calculateTRS(trade: TradeContext, whaleAvgSize: number): number {
  let score = 0;

  // 1. Size Significance
  // Trade should be meaningful relative to whale's avg
  const sizeRatio = trade.sizeUsd / whaleAvgSize;
  if (sizeRatio >= 1.5)
    score += 0.3; // Significant conviction
  else if (sizeRatio >= 0.8)
    score += 0.2; // Normal size
  else if (sizeRatio >= 0.3) score += 0.1; // Small
  // Below 0.3 = likely hedging or testing

  // 2. Absolute Size Floor
  if (trade.sizeUsd < 500) return 0; // Ignore tiny trades
  if (trade.sizeUsd >= 5000) score += 0.15; // Big bet bonus

  // 3. Price Level (Confidence)
  // Buying at 0.15 vs 0.85 has different implications
  // Mid-range (0.3-0.7) = uncertain market = stronger signal from whale
  if (trade.priceLevel >= 0.25 && trade.priceLevel <= 0.75) {
    score += 0.2;
  }
  // Extreme prices = obvious bet, less alpha

  // 4. Timing
  if (trade.isFirstTradeInWindow) score += 0.15; // First mover
  if (trade.timeSinceLastTrade > 60) score += 0.1; // Not spam

  // 5. Specialty Match
  if (trade.symbolMatch) score += 0.1;

  return Math.max(0, Math.min(1, score));
}
```

### 9.4 Combined Whale Signal Score

```typescript
function calculateWhaleSignalScore(
  whale: WhaleQualityMetrics,
  trade: TradeContext,
): number {
  const WQS = calculateWQS(whale);
  const TRS = calculateTRS(trade, whale.avgTradeSize);

  // Combined score with configurable blend
  const WHALE_WEIGHT = 0.6;
  const TRADE_WEIGHT = 0.4;

  return WQS * WHALE_WEIGHT + TRS * TRADE_WEIGHT;
}

// Threshold for inclusion in prediction
const MIN_WHALE_SIGNAL_SCORE = 0.45;
```

### 9.5 Per-Whale Weights (Adaptive)

Вместо одного глобального веса для "whale signals", можно хранить **индивидуальные веса для каждого кита**:

```typescript
interface WhaleWeightRecord {
  walletAddress: string;
  symbol: string; // BTC, ETH, etc.
  weight: number; // 0.0 - 2.0 (multiplier)
  totalPredictions: number;
  correctPredictions: number;
  lastUpdated: number;
}

// ClickHouse Schema
const whaleWeightsTable = `
  CREATE TABLE IF NOT EXISTS whale_weights (
    wallet_address String,
    symbol String,
    weight Float32 DEFAULT 1.0,
    total_predictions UInt32 DEFAULT 0,
    correct_predictions UInt32 DEFAULT 0,
    last_updated DateTime DEFAULT now()
  )
  ENGINE = ReplacingMergeTree()
  ORDER BY (wallet_address, symbol)
`;
```

**Weight Adjustment Algorithm:**

```typescript
async function updateWhaleWeight(
  wallet: string,
  symbol: string,
  wasCorrect: boolean,
) {
  // Get current stats
  const current = await getWhaleWeight(wallet, symbol);

  const newTotal = current.totalPredictions + 1;
  const newCorrect = current.correctPredictions + (wasCorrect ? 1 : 0);
  const newWinrate = newCorrect / newTotal;

  // Calculate new weight
  // Base: 1.0
  // Winrate 60%+ → boost up to 1.5
  // Winrate 40%- → reduce down to 0.5
  // Need minimum 10 trades for adjustment

  let newWeight = 1.0;

  if (newTotal >= 10) {
    if (newWinrate >= 0.65) newWeight = 1.3 + (newWinrate - 0.65) * 2;
    else if (newWinrate >= 0.55) newWeight = 1.0 + (newWinrate - 0.55) * 3;
    else if (newWinrate >= 0.45) newWeight = 1.0;
    else if (newWinrate >= 0.35) newWeight = 0.8 - (0.45 - newWinrate) * 2;
    else newWeight = 0.5;

    // Clamp
    newWeight = Math.max(0.3, Math.min(2.0, newWeight));
  }

  await saveWhaleWeight(wallet, symbol, newWeight, newTotal, newCorrect);
}
```

### 9.6 Signal Source Weights (Per-Source Adaptive)

Аналогично, можно адаптировать веса **для каждого источника сигналов**:

```typescript
interface SourceWeightRecord {
  sourceId: string; // 'binance-ls', 'tradingview', 'traders-union', 'whale-btc', etc.
  symbol: string;
  weight: number;
  accuracy: number; // Historical accuracy for this source+symbol
  sampleSize: number;
}

// Different sources may perform differently for different assets!
// Example:
// - TradingView great for BTC (60% accuracy)
// - TradingView mediocre for XRP (48% accuracy)
// - Whale signals great for SOL (58% accuracy)
// - L/S Ratio best for ETH (55% accuracy)

const DEFAULT_SOURCE_WEIGHTS: Record<string, Record<string, number>> = {
  "binance-ls": {
    BTCUSDT: 0.25,
    ETHUSDT: 0.3, // L/S works well for ETH
    SOLUSDT: 0.2,
    XRPUSDT: 0.15,
  },
  tradingview: {
    BTCUSDT: 0.3, // TV good for BTC
    ETHUSDT: 0.25,
    SOLUSDT: 0.25,
    XRPUSDT: 0.2,
  },
  "traders-union": {
    BTCUSDT: 0.2,
    ETHUSDT: 0.15,
    SOLUSDT: 0.15,
    XRPUSDT: 0.25, // TU better for alts
  },
  "whale-signals": {
    BTCUSDT: 0.25,
    ETHUSDT: 0.3,
    SOLUSDT: 0.4, // Whales dominate SOL prediction
    XRPUSDT: 0.4,
  },
};
```

### 9.7 Final Weighted Prediction Formula

```typescript
function calculateFinalPrediction(
  symbol: string,
  signals: {
    lsScore: number; // -1 to 1
    tvScore: number; // -1 to 1
    tuScore: number; // -1 to 1
    whaleSignals: Array<{
      walletAddress: string;
      direction: "UP" | "DOWN";
      whaleSignalScore: number;
    }>;
  },
  sourceWeights: Record<string, Record<string, number>>,
  whaleWeights: Map<string, number>,
): PredictionResult {
  // 1. Technical Signals (normalized to -1 to 1)
  const lsWeight = sourceWeights["binance-ls"][symbol] || 0.25;
  const tvWeight = sourceWeights["tradingview"][symbol] || 0.25;
  const tuWeight = sourceWeights["traders-union"][symbol] || 0.2;
  const whaleWeight = sourceWeights["whale-signals"][symbol] || 0.3;

  let technicalScore = 0;
  technicalScore += signals.lsScore * lsWeight;
  technicalScore += signals.tvScore * tvWeight;
  technicalScore += signals.tuScore * tuWeight;

  // 2. Whale Consensus Score
  let whaleConsensus = 0;
  let totalWhaleWeight = 0;

  for (const ws of signals.whaleSignals) {
    const individualWeight = whaleWeights.get(ws.walletAddress) || 1.0;
    const adjustedScore = ws.whaleSignalScore * individualWeight;

    const direction = ws.direction === "UP" ? 1 : -1;
    whaleConsensus += direction * adjustedScore;
    totalWhaleWeight += adjustedScore;
  }

  // Normalize whale consensus to [-1, 1]
  if (totalWhaleWeight > 0) {
    whaleConsensus = whaleConsensus / totalWhaleWeight;
  }

  // 3. Final Combined Score
  const finalScore = technicalScore + whaleConsensus * whaleWeight;

  // 4. Determine Direction & Confidence
  let direction: "UP" | "DOWN" | "NEUTRAL";
  if (finalScore > 0.12) direction = "UP";
  else if (finalScore < -0.12) direction = "DOWN";
  else direction = "NEUTRAL";

  const confidence = Math.min(100, Math.abs(finalScore) * 100);

  return {
    symbol,
    direction,
    confidence,
    score: finalScore,
    breakdown: {
      technical: technicalScore,
      whaleConsensus,
      contributingWhales: signals.whaleSignals.length,
    },
  };
}
```

---

## 10. Mathematical Framework: Bayesian Weight Updates

### 10.1 Формализация

Пусть $S_i$ — сигнал от источника $i$, $W$ — результат (Win=1, Loss=0).

Мы хотим найти оптимальные веса $w_i$ такие, что:

$$\text{Prediction} = \text{sign}\left(\sum_{i} w_i \cdot S_i\right)$$

максимизирует $P(W=1 | \text{Prediction})$.

### 10.2 Naive Bayes Approach

Для каждого источника оцениваем:

$$P(W=1 | S_i > 0) = \frac{\text{Correct predictions when } S_i > 0}{\text{Total predictions when } S_i > 0}$$

Тогда вес пропорционален **lift**:

$$w_i \propto \frac{P(W=1 | S_i > 0)}{P(W=1)} - 1$$

Если источник даёт 60% accuracy при базовых 50%, его lift = 0.2, и вес увеличивается.

### 10.3 Online Learning (Exponential Weighted Moving Average)

Для адаптивных весов используем EWMA:

$$w_i^{(t+1)} = \alpha \cdot \text{accuracy}_i^{(t)} + (1-\alpha) \cdot w_i^{(t)}$$

где $\alpha = 0.1$ (slow adaptation) или $\alpha = 0.3$ (fast adaptation).

### 10.4 Regularization

Чтобы избежать overfitting на малых выборках:

$$w_i^{\text{final}} = w_i^{\text{raw}} \cdot \min\left(1, \frac{n_i}{N_{\text{min}}}\right)$$

где $n_i$ — количество сэмплов для источника, $N_{\text{min}} = 50$ — минимум для полного веса.

---

## 11. Data Pipeline для Weight Learning

### 11.1 New ClickHouse Tables

```sql
-- Per-prediction signals breakdown
CREATE TABLE prediction_signals (
  prediction_id UUID,
  symbol String,
  window_start DateTime,

  -- Individual signal values at prediction time
  signal_ls_ratio Float32,
  signal_ls_contribution Float32,   -- signal * weight
  signal_tv_rating Float32,
  signal_tv_contribution Float32,
  signal_tu_forecast Float32,
  signal_tu_contribution Float32,

  -- Whale breakdown (JSON for flexibility)
  whale_signals String,  -- JSON array of {wallet, direction, score, weight}
  whale_contribution Float32,

  -- Outcome
  predicted_direction Enum8('UP'=1, 'DOWN'=-1, 'NEUTRAL'=0),
  actual_direction Enum8('UP'=1, 'DOWN'=-1, 'NEUTRAL'=0),
  is_correct UInt8,

  created_at DateTime DEFAULT now()
)
ENGINE = MergeTree()
ORDER BY (symbol, window_start);

-- Aggregated source accuracy (materialized view)
CREATE MATERIALIZED VIEW source_accuracy_mv
ENGINE = SummingMergeTree()
ORDER BY (source_id, symbol)
AS
SELECT
  source_id,
  symbol,
  count() as total_signals,
  sum(is_correct) as correct_signals,
  sum(is_correct) / count() as accuracy
FROM (
  -- Subquery to unnest signals per source
  SELECT symbol, 'binance-ls' as source_id,
         signal_ls_ratio != 0 as had_signal,
         is_correct
  FROM prediction_signals
  WHERE signal_ls_ratio != 0

  UNION ALL

  SELECT symbol, 'tradingview' as source_id,
         signal_tv_rating != 0 as had_signal,
         is_correct
  FROM prediction_signals
  WHERE signal_tv_rating != 0

  -- ... etc
)
GROUP BY source_id, symbol;
```

### 11.2 Weight Update Job (Cron)

```typescript
// Run every 6 hours
async function runWeightOptimization() {
  // 1. Fetch recent prediction results (last 7 days)
  const results = await clickhouse.query(`
    SELECT * FROM prediction_signals
    WHERE created_at > now() - INTERVAL 7 DAY
      AND actual_direction != 'NEUTRAL'
  `);

  // 2. Calculate per-source accuracy by symbol
  const sourceAccuracy = computeSourceAccuracy(results);

  // 3. Update source weights
  for (const [source, symbolAccuracies] of Object.entries(sourceAccuracy)) {
    for (const [symbol, acc] of Object.entries(symbolAccuracies)) {
      const newWeight = accuracyToWeight(acc.accuracy, acc.sampleSize);
      await updateSourceWeight(source, symbol, newWeight);
    }
  }

  // 4. Calculate per-whale accuracy
  const whaleAccuracy = computeWhaleAccuracy(results);

  // 5. Update whale weights
  for (const [wallet, symbolAccuracies] of Object.entries(whaleAccuracy)) {
    for (const [symbol, acc] of Object.entries(symbolAccuracies)) {
      const newWeight = accuracyToWeight(acc.accuracy, acc.sampleSize);
      await updateWhaleWeight(wallet, symbol, newWeight);
    }
  }

  logger.info("Weight optimization completed");
}

function accuracyToWeight(accuracy: number, sampleSize: number): number {
  // Regularization: need at least 20 samples for full weight effect
  const confidence = Math.min(1, sampleSize / 20);

  // Base weight = 1.0
  // Accuracy 0.5 = weight 1.0
  // Accuracy 0.6 = weight 1.3
  // Accuracy 0.7 = weight 1.6
  // Accuracy 0.4 = weight 0.7

  const rawWeight = 1.0 + (accuracy - 0.5) * 3;
  const adjustedWeight = 1.0 + (rawWeight - 1.0) * confidence;

  return Math.max(0.3, Math.min(2.0, adjustedWeight));
}
```

---

## Appendix A: TradingView Column Indices

| Index | Column Name       | Usage                   |
| ----- | ----------------- | ----------------------- |
| 0     | ticker-view       | Symbol identifier       |
| 1     | crypto_total_rank | Market cap rank         |
| 2     | TechRating_1D     | **Primary tech signal** |
| 3     | TechRating_1D.tr  | Rating text             |
| 4     | MARating_1D       | Moving average rating   |
| 5     | MARating_1D.tr    | MA rating text          |
| 6     | OsRating_1D       | Oscillators rating      |
| 7     | OsRating_1D.tr    | Osc rating text         |
| 8     | RSI               | **RSI value**           |
| 9     | Mom               | Momentum                |
| ...   | ...               | ...                     |

---

## Appendix B: Symbol Normalization

```typescript
// TradingView → Internal
"CRYPTO:BTCUSD" → "BTCUSDT"
"CRYPTO:ETHUSD" → "ETHUSDT"

// Binance → Internal
"BTCUSDT" → "BTCUSDT" (no change)
"BTC-USDT" → "BTCUSDT"

// OKX → Internal
"BTC-USDT" → "BTC-USDT" (keep as-is or normalize)
```

---

_Document Version: 1.0_
_Author: Polygon Pipeline Team_
_Date: January 2026_
