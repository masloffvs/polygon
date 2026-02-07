export const config = {
  width: 800,
  height: 420,
  fonts: [
    {
      name: "Cal Sans",
      url: "https://github.com/calcom/sans/raw/refs/heads/main/fonts/ttf/CalSans-Regular.ttf",
      weight: 600,
      style: "normal",
    },
  ],
};

function currentTime(): string {
  const now = new Date();
  const hours = String(now.getUTCHours()).padStart(2, "0");
  const minutes = String(now.getUTCMinutes()).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${day}.${month} ${hours}:${minutes} UTC`;
}

export default function ArbitrageSpreadTemplate({
  pair = "BTC/USDT",
  exchangeBuy = "Binance",
  exchangeSell = "Bybit",
  priceBuy = 67420.5,
  priceSell = 67892.3,
  spreadPercent = 0.7,
  spreadUsd = 471.8,
  timestamp = "",
}: {
  pair: string;
  exchangeBuy: string;
  exchangeSell: string;
  priceBuy: number;
  priceSell: number;
  spreadPercent: number;
  spreadUsd?: number;
  timestamp?: string;
}) {
  // Nodeverse-inspired palette
  const theme = {
    bg: "#050d09", // Very dark green-black
    bgCard: "#0a1a12", // Dark green for cards
    lime: "#c6ff4e", // Neon Lime
    cyan: "#00bafc", // Dark Matter Cyan
    textMain: "#ffffff",
    textDim: "#4a6355", // Muted green-gray
    border: "#1a2f23", // Subtle green border
  };

  const displayTime = timestamp || currentTime();

  const formatPrice = (price: number) => {
    if (price >= 1000) {
      return price.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    }
    return price.toLocaleString("en-US", {
      minimumFractionDigits: 4,
      maximumFractionDigits: 4,
    });
  };

  // Grid dots for background - full coverage
  const gridRows = 16;
  const gridCols = 32;
  const dots = [];
  for (let row = 0; row <= gridRows; row++) {
    for (let col = 0; col <= gridCols; col++) {
      // Add slight randomness to positions
      const offsetX = Math.sin(row * col * 0.5) * 0.3;
      const offsetY = Math.cos(row * col * 0.7) * 0.3;
      dots.push({
        row,
        col,
        offsetX,
        offsetY,
        // Vary opacity slightly
        opacity: 0.2 + Math.abs(Math.sin(row + col)) * 0.3,
      });
    }
  }

  return (
    <div
      style={{
        display: "flex",
        height: "100%",
        width: "100%",
        backgroundColor: theme.bg,
        fontFamily: "Cal Sans",
        fontWeight: 600,
        color: theme.textMain,
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Background gradient overlay */}
      <div
        style={{
          display: "flex",
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: `radial-gradient(ellipse 80% 60% at 70% 20%, ${theme.lime}08 0%, transparent 50%)`,
        }}
      />

      {/* Noise texture overlay - stronger */}
      <div
        style={{
          display: "flex",
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          opacity: 0.06,
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='5' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
        }}
      />

      {/* Light falloff - top right warm */}
      <div
        style={{
          display: "flex",
          position: "absolute",
          top: "-20%",
          right: "-10%",
          width: "70%",
          height: "80%",
          background: `radial-gradient(ellipse at center, ${theme.lime}12 0%, transparent 60%)`,
          filter: "blur(80px)",
        }}
      />

      {/* Light falloff - center left cool */}
      <div
        style={{
          display: "flex",
          position: "absolute",
          top: "20%",
          left: "-15%",
          width: "50%",
          height: "60%",
          background: `radial-gradient(ellipse at center, ${theme.cyan}08 0%, transparent 55%)`,
          filter: "blur(70px)",
        }}
      />

      {/* Light falloff - bottom ambient */}
      <div
        style={{
          display: "flex",
          position: "absolute",
          bottom: "-30%",
          left: "30%",
          width: "60%",
          height: "50%",
          background: `radial-gradient(ellipse at center, ${theme.lime}06 0%, ${theme.cyan}04 30%, transparent 60%)`,
          filter: "blur(90px)",
        }}
      />

      {/* Vignette overlay */}
      <div
        style={{
          display: "flex",
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: `radial-gradient(ellipse 70% 60% at 50% 50%, transparent 30%, ${theme.bg}90 100%)`,
        }}
      />

      {/* Dot grid pattern - full spread */}
      <div
        style={{
          display: "flex",
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
        }}
      >
        {dots.map((dot, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              position: "absolute",
              left: `${(dot.col / gridCols) * 100 + dot.offsetX}%`,
              top: `${(dot.row / gridRows) * 100 + dot.offsetY}%`,
              width: "2px",
              height: "2px",
              borderRadius: "50%",
              backgroundColor: theme.textDim,
              opacity: dot.opacity,
            }}
          />
        ))}
      </div>

      {/* Accent glow - lime/cyan gradient */}
      <div
        style={{
          display: "flex",
          position: "absolute",
          top: "-50px",
          right: "50px",
          width: "350px",
          height: "250px",
          background: `radial-gradient(ellipse at center, ${theme.lime}20 0%, ${theme.cyan}10 40%, transparent 70%)`,
          filter: "blur(60px)",
        }}
      />

      {/* Secondary glow bottom left */}
      <div
        style={{
          display: "flex",
          position: "absolute",
          bottom: "-80px",
          left: "-50px",
          width: "300px",
          height: "200px",
          background: `radial-gradient(ellipse at center, ${theme.cyan}15 0%, transparent 60%)`,
          filter: "blur(50px)",
        }}
      />

      {/* Main content */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          padding: "36px 40px",
          position: "relative",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: "28px",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                marginBottom: "6px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  width: "8px",
                  height: "8px",
                  borderRadius: "50%",
                  backgroundColor: theme.lime,
                  boxShadow: `0 0 16px ${theme.lime}`,
                }}
              />
              <div
                style={{
                  display: "flex",
                  fontSize: 13,
                  color: theme.textDim,
                  textTransform: "uppercase",
                  letterSpacing: "4px",
                }}
              >
                Arbitrage Signal
              </div>
            </div>
            <div
              style={{
                display: "flex",
                fontSize: 44,
                color: theme.textMain,
                letterSpacing: "-1px",
              }}
            >
              {pair}
            </div>
          </div>

          {/* Spread Display */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-end",
            }}
          >
            <div
              style={{
                display: "flex",
                fontSize: 84,
                background: `linear-gradient(135deg, ${theme.lime} 0%, ${theme.cyan} 100%)`,
                backgroundClip: "text",
                color: "transparent",
                lineHeight: 1,
                letterSpacing: "-3px",
              }}
            >
              +{spreadPercent.toFixed(2)}%
            </div>
          </div>
        </div>

        {/* Exchange Flow */}
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            gap: "20px",
            flex: 1,
          }}
        >
          {/* Buy Side */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              flex: 1,
              backgroundColor: theme.bgCard,
              borderRadius: "14px",
              padding: "12px 16px",
              position: "relative",
              overflow: "hidden",
            }}
          >
            {/* Card inner glow */}
            <div
              style={{
                display: "flex",
                position: "absolute",
                top: "-20px",
                left: "-20px",
                width: "100px",
                height: "100px",
                background: `radial-gradient(circle, ${theme.lime}15 0%, transparent 70%)`,
                filter: "blur(20px)",
              }}
            />
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                marginBottom: "4px",
                position: "relative",
              }}
            >
              <div
                style={{
                  display: "flex",
                  width: "6px",
                  height: "6px",
                  borderRadius: "50%",
                  backgroundColor: theme.lime,
                }}
              />
              <div
                style={{
                  display: "flex",
                  fontSize: 11,
                  color: theme.lime,
                  textTransform: "uppercase",
                  letterSpacing: "2px",
                }}
              >
                Buy
              </div>
            </div>
            <div
              style={{
                display: "flex",
                fontSize: 18,
                color: theme.textMain,
                marginBottom: "2px",
                position: "relative",
              }}
            >
              {exchangeBuy}
            </div>
            <div
              style={{
                display: "flex",
                fontSize: 48,
                color: theme.textMain,
                position: "relative",
              }}
            >
              ${formatPrice(priceBuy)}
            </div>
          </div>

          {/* Arrow */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
          >
            <svg width="36" height="20" viewBox="0 0 36 20" fill="none">
              <defs>
                <linearGradient
                  id="arrowGrad"
                  x1="0%"
                  y1="0%"
                  x2="100%"
                  y2="0%"
                >
                  <stop offset="0%" stopColor={theme.lime} />
                  <stop offset="100%" stopColor={theme.cyan} />
                </linearGradient>
              </defs>
              <path
                d="M0 10H32M32 10L24 3M32 10L24 17"
                stroke="url(#arrowGrad)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>

          {/* Sell Side */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              flex: 1,
              backgroundColor: theme.bgCard,
              borderRadius: "14px",
              padding: "12px 16px",
              position: "relative",
              overflow: "hidden",
            }}
          >
            {/* Card inner glow */}
            <div
              style={{
                display: "flex",
                position: "absolute",
                top: "-20px",
                right: "-20px",
                width: "100px",
                height: "100px",
                background: `radial-gradient(circle, ${theme.cyan}15 0%, transparent 70%)`,
                filter: "blur(20px)",
              }}
            />
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                marginBottom: "4px",
                position: "relative",
              }}
            >
              <div
                style={{
                  display: "flex",
                  width: "6px",
                  height: "6px",
                  borderRadius: "50%",
                  backgroundColor: theme.cyan,
                }}
              />
              <div
                style={{
                  display: "flex",
                  fontSize: 11,
                  color: theme.cyan,
                  textTransform: "uppercase",
                  letterSpacing: "2px",
                }}
              >
                Sell
              </div>
            </div>
            <div
              style={{
                display: "flex",
                fontSize: 18,
                color: theme.textMain,
                marginBottom: "2px",
                position: "relative",
              }}
            >
              {exchangeSell}
            </div>
            <div
              style={{
                display: "flex",
                fontSize: 48,
                color: theme.textMain,
                position: "relative",
              }}
            >
              ${formatPrice(priceSell)}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "flex-end",
            marginTop: "16px",
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 10,
              color: theme.textDim,
              maxWidth: "70%",
              lineHeight: 1.3,
            }}
          >
            Not financial advice. For informational purposes only.
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 12,
              color: theme.textDim,
            }}
          >
            {displayTime}
          </div>
        </div>
      </div>
    </div>
  );
}
