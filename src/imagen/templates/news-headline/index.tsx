export const config = {
  width: 800,
  height: 450,
  fonts: [
    {
      name: "Fraunces",
      url: "https://github.com/undercasetype/Fraunces/raw/refs/heads/master/fonts/ttf/Fraunces144pt-Black.ttf",
      weight: 900,
      style: "normal",
    },
    {
      name: "Fraunces",
      url: "https://github.com/undercasetype/Fraunces/raw/refs/heads/master/fonts/ttf/Fraunces72pt-Regular.ttf",
      weight: 400,
      style: "normal",
    },
  ],
};

function currentDate(): string {
  const now = new Date();
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
  const day = now.getUTCDate();
  const month = monthNames[now.getUTCMonth()];
  const year = now.getUTCFullYear();
  return `${month} ${day}, ${year}`;
}

export default function NewsHeadlineTemplate({
  headline = "BREAKING NEWS",
  subheadline = "Markets React to Major Economic Announcement",
  date = "",
}: {
  headline: string;
  subheadline?: string;
  date?: string;
}) {
  const theme = {
    bg: "#ffffff",
    textMain: "#000000",
    textDim: "#4a4a4a",
    accent: "#000000",
  };

  const displayDate = date || currentDate();

  // Calculate headline font size based on length
  const getHeadlineFontSize = (length: number) => {
    if (length > 60) return 36;
    if (length > 40) return 44;
    if (length > 25) return 52;
    return 64;
  };

  const headlineFontSize = getHeadlineFontSize(headline.length);

  return (
    <div
      style={{
        display: "flex",
        height: "100%",
        width: "100%",
        backgroundColor: theme.bg,
        fontFamily: "Fraunces",
        color: theme.textMain,
      }}
    >
      {/* Inner Container */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          width: "100%",
          height: "100%",
          padding: "40px 60px",
          textAlign: "center",
        }}
      >
        {/* Top Decorative Line */}
        <div
          style={{
            display: "flex",
            width: "120px",
            height: "4px",
            backgroundColor: theme.accent,
            marginBottom: "24px",
          }}
        />

        {/* Date */}
        <div
          style={{
            display: "flex",
            fontSize: 14,
            fontWeight: 400,
            color: theme.textDim,
            textTransform: "uppercase",
            letterSpacing: "3px",
            marginBottom: "20px",
          }}
        >
          {displayDate}
        </div>

        {/* Headline */}
        <div
          style={{
            display: "flex",
            fontSize: headlineFontSize,
            fontWeight: 900,
            color: theme.textMain,
            lineHeight: 1.1,
            textAlign: "center",
            textTransform: "uppercase",
            letterSpacing: "-0.02em",
            maxWidth: "100%",
          }}
        >
          {headline}
        </div>

        {/* Divider */}
        {subheadline && (
          <div
            style={{
              display: "flex",
              width: "60px",
              height: "2px",
              backgroundColor: theme.textDim,
              margin: "24px 0",
            }}
          />
        )}

        {/* Subheadline */}
        {subheadline && (
          <div
            style={{
              display: "flex",
              fontSize: 22,
              fontWeight: 400,
              color: theme.textDim,
              lineHeight: 1.4,
              textAlign: "center",
              fontStyle: "italic",
              maxWidth: "85%",
            }}
          >
            {subheadline}
          </div>
        )}

        {/* Bottom Decorative Line */}
        <div
          style={{
            display: "flex",
            width: "120px",
            height: "4px",
            backgroundColor: theme.accent,
            marginTop: "24px",
          }}
        />
      </div>
    </div>
  );
}
