export const config = {
  width: 800,
  height: 400,
  fonts: [
    {
      name: "Bricolage Grotesque",
      url: "https://github.com/ateliertriay/bricolage/raw/refs/heads/main/fonts/ttf/BricolageGrotesque-Bold.ttf",
      weight: 700,
      style: "normal",
    },
  ],
};

function currentUtcDay(): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");

  // like 12 November 2024
  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  return `${day} ${monthNames[now.getUTCMonth()]}, ${year}`;
}

export default function ImageTemplate({
  score = 88,
  date = currentUtcDay(),
  title = "Crypto Fear &",
  subtitle = "Greed Index",
}: {
  score: number;
  date?: string;
  title?: string;
  subtitle?: string;
}) {
  // Helper to determine label based on score
  const getLabel = (s: number) => {
    if (s >= 75) return "Extreme Greed";
    if (s >= 55) return "Greed";
    if (s >= 45) return "Neutral";
    if (s >= 25) return "Fear";
    return "Extreme Fear";
  };

  // Dark theme + Neon/Lime colors
  const theme = {
    bg: "#09090b", // Almost black
    textMain: "#ffffff",
    textDim: "#a1a1aa",
    // Neon segments
    red: "#ff2d55", // Neon Red/Pink
    orange: "#ff9f0a", // Neon Orange
    yellow: "#ffd60a", // Neon Yellow
    green: "#a3e635", // Lime Green
  };

  const getColor = (s: number) => {
    if (s >= 75) return theme.green;
    if (s >= 55) return theme.green;
    if (s >= 45) return theme.yellow;
    if (s >= 25) return theme.orange;
    return theme.red;
  };

  const label = getLabel(score);
  const scoreColor = getColor(score);

  return (
    <div
      style={{
        display: "flex",
        height: "100%",
        width: "100%",
        backgroundColor: theme.bg,
        padding: "20px",
        fontFamily: "Bricolage Grotesque",
        fontWeight: 700,
        color: theme.textMain,
      }}
    >
      {/* Inner Container */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          width: "100%",
          height: "100%",
          padding: "40px",
          position: "relative",
        }}
      >
        {/* Top Section */}
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            justifyContent: "space-between",
            width: "100%",
          }}
        >
          {/* Left Side: Date, Title */}
          <div style={{ display: "flex", flexDirection: "column" }}>
            {/* Title Text */}
            <div
              style={{
                display: "flex",
                fontSize: 32,
                color: theme.textDim,
                marginBottom: "0px",
              }}
            >
              {date}
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                fontSize: 54,
                fontWeight: 700,
                color: theme.textMain,
                lineHeight: 1.1,
              }}
            >
              <span>{title}</span>
              <span>{subtitle}</span>
            </div>
          </div>

          {/* Right Side: Score */}
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
                fontSize: 140,
                fontWeight: 700,
                color: scoreColor,
                lineHeight: 1,
                textShadow: `0 0 20px ${scoreColor}40`,
              }}
            >
              {score}
            </div>
            <div
              style={{
                display: "flex",
                fontSize: 24,
                fontWeight: 700,
                color: theme.textMain,
                textTransform: "uppercase",
                letterSpacing: "1px",
              }}
            >
              {label}
            </div>
          </div>
        </div>

        {/* Bottom Section: Linear Progress Bar */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            width: "100%",
            marginTop: "auto",
            paddingTop: "40px",
          }}
        >
          {/* The Bar */}
          <div
            style={{
              display: "flex",
              flexDirection: "row",
              width: "100%",
              height: "12px",
              borderRadius: "6px",
              overflow: "hidden",
              backgroundColor: "#333",
            }}
          >
            <div
              style={{
                display: "flex",
                flex: 1,
                backgroundColor: theme.red,
                marginRight: "4px",
                boxShadow: `0 0 10px ${theme.red}40`,
              }}
            ></div>
            <div
              style={{
                display: "flex",
                flex: 1,
                backgroundColor: theme.orange,
                marginRight: "4px",
                boxShadow: `0 0 10px ${theme.orange}40`,
              }}
            ></div>
            <div
              style={{
                display: "flex",
                flex: 1,
                backgroundColor: theme.yellow,
                marginRight: "4px",
                boxShadow: `0 0 10px ${theme.yellow}40`,
              }}
            ></div>
            <div
              style={{
                display: "flex",
                flex: 1,
                backgroundColor: theme.green,
                boxShadow: `0 0 10px ${theme.green}40`,
              }}
            ></div>
          </div>

          {/* The Arrow/Indicator Container */}
          <div
            style={{
              display: "flex",
              width: "100%",
              position: "relative",
              height: "24px",
              marginTop: "12px",
            }}
          >
            <div
              style={{
                display: "flex",
                position: "absolute",
                left: `${score}%`,
                top: 0,
                transform: "translateX(-50%)",
              }}
            >
              {/* Upward pointing arrow */}
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M12 4L4 18H20L12 4Z" fill={theme.textMain} />
              </svg>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
