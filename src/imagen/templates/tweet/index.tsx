export const config = {
  width: 800,
  height: 450,
  fonts: [
    {
      name: "Bricolage Grotesque",
      url: "https://github.com/ateliertriay/bricolage/raw/refs/heads/main/fonts/ttf/BricolageGrotesque-Bold.ttf",
      weight: 700,
      style: "normal",
    },
    {
      name: "Work Sans",
      url: "https://github.com/weiweihuanghuang/Work-Sans/raw/master/fonts/ttf/WorkSans-Regular.ttf",
      weight: 400,
      style: "normal",
    },
  ],
};

export default function TweetTemplate({
  text = "The future belongs to those who believe in the beauty of their dreams.",
  author = "@elonmusk",
  accent = "blue",
}: {
  text: string;
  author?: string;
  accent?: "blue" | "green" | "purple" | "orange";
}) {
  // Dark theme matching fear-greed style
  const theme = {
    bg: "#000000",
    textMain: "#ffffff",
    textDim: "#a1a1aa",
    // Accent colors
    blue: "#0ea5e9",
    green: "#a3e635",
    purple: "#a855f7",
    orange: "#ff9f0a",
  };

  const accentColor = theme[accent] || theme.blue;

  // Get avatar URL from unavatar.io
  const username = author.replace(/^@/, "");
  const avatarUrl = `https://unavatar.io/x/${username}`;

  // Truncate text to 280 chars max (Twitter limit)
  const MAX_LENGTH = 280;
  const displayText =
    text.length > MAX_LENGTH ? text.slice(0, MAX_LENGTH - 3) + "..." : text;

  // Calculate font size based on text length
  const getFontSize = (length: number) => {
    if (length > 200) return 28;
    if (length > 150) return 32;
    if (length > 100) return 36;
    if (length > 50) return 42;
    return 48;
  };

  const fontSize = getFontSize(parseInt(`${displayText.length * 0.8}`, 10));

  return (
    <div
      style={{
        display: "flex",
        height: "100%",
        width: "100%",
        backgroundColor: theme.bg,
        padding: "20px",
        fontFamily: "Bricolage Grotesque",
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
        {/* Quote Icon */}
        <div
          style={{
            display: "flex",
            position: "absolute",
            top: "20px",
            left: "40px",
          }}
        >
          <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            scale={0.9}
          >
            <path
              d="M10 8H6C4.89543 8 4 8.89543 4 10V14C4 15.1046 4.89543 16 6 16H8C9.10457 16 10 15.1046 10 14V8ZM10 8C10 5.79086 8.20914 4 6 4"
              stroke={accentColor}
              strokeWidth="2"
              strokeLinecap="round"
            />
            <path
              d="M20 8H16C14.8954 8 14 8.89543 14 10V14C14 15.1046 14.8954 16 16 16H18C19.1046 16 20 15.1046 20 14V8ZM20 8C20 5.79086 18.2091 4 16 4"
              stroke={accentColor}
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </div>

        {/* Main Content - Speech Bubble */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            flex: 1,
            paddingTop: "40px",
            position: "relative",
          }}
        >
          {/* Bubble */}
          <div
            style={{
              display: "flex",
              position: "relative",
              backgroundColor: "#ffffff",
              borderRadius: "24px",
              padding: "12px 24px",
            }}
          >
            {/* Tweet Text */}
            <div
              style={{
                display: "flex",
                fontSize: fontSize,
                fontFamily: "Work Sans",
                fontWeight: 400,
                color: "#09090b",
                lineHeight: 1,
                letterSpacing: "-0.01em",
              }}
            >
              {displayText}
            </div>
          </div>
          {/* Bubble Tail
          <div
            style={{
              display: "flex",
              position: "absolute",
              bottom: "-12px",
              left: "60px",
            }}
          >
            <svg width="24" height="16" viewBox="0 0 24 16" fill="none">
              <path d="M12 16L0 0H24L12 16Z" fill="#ffffff" />
            </svg>
          </div> */}
        </div>

        {/* Bottom Section: Author */}
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            width: "100%",
            marginTop: "auto",
            paddingTop: "24px",
          }}
        >
          {/* Author Info */}
          <div
            style={{
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              gap: "16px",
            }}
          >
            {/* Avatar */}
            <img
              src={avatarUrl}
              width={48}
              height={48}
              style={{
                width: "48px",
                height: "48px",
                borderRadius: "50%",
                objectFit: "cover",
                boxShadow: `0 0 20px ${accentColor}40`,
              }}
            />

            {/* Author Name */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div
                style={{
                  display: "flex",
                  fontSize: 24,
                  fontWeight: 700,
                  color: accentColor,
                  textShadow: `0 0 20px ${accentColor}40`,
                }}
              >
                {author}
              </div>
            </div>
          </div>

          {/* X/Twitter Logo */}
          <div
            style={{
              display: "flex",
            }}
          >
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill={theme.textDim}
            >
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
          </div>
        </div>

        {/* Accent Line */}
        <div
          style={{
            display: "flex",
            position: "absolute",
            bottom: "20px",
            left: "40px",
            right: "40px",
            height: "3px",
            borderRadius: "2px",
            background: `linear-gradient(90deg, ${accentColor}, ${accentColor}00)`,
            boxShadow: `0 0 20px ${accentColor}60`,
          }}
        />
      </div>
    </div>
  );
}
