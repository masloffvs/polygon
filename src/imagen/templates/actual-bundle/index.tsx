import fs from "node:fs";
import path from "node:path";

// Convert local images to base64 data URLs
function toDataUrl(filePath: string): string {
  const buffer = fs.readFileSync(filePath);
  const base64 = buffer.toString("base64");
  const ext = path.extname(filePath).slice(1);
  const mimeType =
    ext === "png"
      ? "image/png"
      : ext === "jpg" || ext === "jpeg"
        ? "image/jpeg"
        : "image/png";
  return `data:${mimeType};base64,${base64}`;
}

// Get PNG dimensions from buffer
function getPngDimensions(filePath: string): { width: number; height: number } {
  const buffer = fs.readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase();

  if (ext === ".png") {
    // PNG width is at bytes 16-19, height at 20-23 (big-endian)
    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);
    return { width, height };
  } else if (ext === ".jpg" || ext === ".jpeg") {
    // JPEG: find SOF0 marker (0xFF 0xC0) for dimensions
    let i = 0;
    while (i < buffer.length - 9) {
      if (buffer[i] === 0xff) {
        const marker = buffer[i + 1];
        // SOF markers: C0-C3, C5-C7, C9-CB, CD-CF
        if (
          (marker >= 0xc0 && marker <= 0xc3) ||
          (marker >= 0xc5 && marker <= 0xc7) ||
          (marker >= 0xc9 && marker <= 0xcb) ||
          (marker >= 0xcd && marker <= 0xcf)
        ) {
          const height = buffer.readUInt16BE(i + 5);
          const width = buffer.readUInt16BE(i + 7);
          return { width, height };
        }
        if (
          marker === 0xd8 ||
          marker === 0xd9 ||
          (marker >= 0xd0 && marker <= 0xd7)
        ) {
          i += 2;
        } else {
          const len = buffer.readUInt16BE(i + 2);
          i += 2 + len;
        }
      } else {
        i++;
      }
    }
    // Fallback
    return { width: 1280, height: 720 };
  }
  return { width: 1280, height: 720 };
}

// Resolve asset paths
const bgFiles = ["bg.png", "bg2.jpeg", "bg3.jpeg"];
const iconPath = path.resolve(
  import.meta.dirname,
  "../../assets/replicate-prediction-x6jram2madrmr0cw8dnv85xv2g.png",
);

// Convert to data URLs
const iconDataUrl = toDataUrl(iconPath);

// Function to get random background
function getRandomBgDataUrl(): string {
  const randomBg = bgFiles[Math.floor(Math.random() * bgFiles.length)];
  const bgPath = path.resolve(import.meta.dirname, `../../assets/${randomBg}`);
  return toDataUrl(bgPath);
}

export const config = {
  width: 950,
  height: 480,
  fonts: [
    {
      name: "Geologica",
      url: "https://github.com/googlefonts/geologica/raw/main/fonts/ttf/Geologica-Bold.ttf",
      weight: 700,
      style: "normal",
    },
    {
      name: "Geologica",
      url: "https://github.com/googlefonts/geologica/raw/main/fonts/ttf/Geologica-Regular.ttf",
      weight: 400,
      style: "normal",
    },
  ],
};

function formatDate(): string {
  const now = new Date();
  const monthNames = [
    "января",
    "февраля",
    "марта",
    "апреля",
    "мая",
    "июня",
    "июля",
    "августа",
    "сентября",
    "октября",
    "ноября",
    "декабря",
  ];
  const day = now.getUTCDate();
  const month = monthNames[now.getUTCMonth()];
  const year = now.getUTCFullYear();
  return `${day} ${month} ${year} год`;
}

// Generate noise texture as SVG data URL
function generateNoiseTexture(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
    <filter id="noise">
      <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="4" stitchTiles="stitch"/>
      <feColorMatrix type="saturate" values="0"/>
    </filter>
    <rect width="100%" height="100%" filter="url(#noise)" opacity="1"/>
  </svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

const noiseTexture = generateNoiseTexture();

export default function ActualBundleTemplate({
  label = "Максимальный",
  value = "8.9 %",
  date = formatDate(),
}: {
  label?: string;
  value?: string;
  date?: string;
}) {
  // Get random background on each render
  const bgDataUrl = getRandomBgDataUrl();

  // Random light position for natural variation
  const lightAngle = Math.random() * 360;
  const lightX = 50 + Math.cos((lightAngle * Math.PI) / 180) * 30;
  const lightY = 30 + Math.sin((lightAngle * Math.PI) / 180) * 20;

  return (
    <div
      style={{
        display: "flex",
        height: "100%",
        width: "100%",
        position: "relative",
        fontFamily: "Geologica",
      }}
    >
      {/* Background */}
      <img
        src={bgDataUrl}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
        }}
      />

      {/* Light overlay - random position for natural look */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          background: `radial-gradient(ellipse at ${lightX}% ${lightY}%, rgba(255,255,255,0.08) 0%, transparent 60%)`,
        }}
      />

      {/* Subtle vignette */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          background:
            "radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.3) 100%)",
        }}
      />

      {/* Noise grain overlay */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          backgroundImage: `url("${noiseTexture}")`,
          backgroundRepeat: "repeat",
          opacity: 0.06,
        }}
      />

      {/* Content Container - 10% from left, centered vertically */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "center",
          height: "100%",
          paddingLeft: "10%",
          position: "relative",
        }}
      >
        {/* Icon */}
        <img
          src={iconDataUrl}
          style={{
            height: 120,
            marginBottom: 48,
          }}
        />

        {/* Label */}
        <div
          style={{
            display: "flex",
            fontSize: 28,
            fontWeight: 400,
            color: "#ffffff",
            marginBottom: 8,
          }}
        >
          {label}
        </div>

        {/* Value */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            marginBottom: 12,
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 96,
              fontWeight: 700,
              color: "#ffffff",
              lineHeight: 1,
            }}
          >
            {value}
          </div>
        </div>

        {/* Date */}
        <div
          style={{
            display: "flex",
            fontSize: 18,
            fontWeight: 400,
            color: "rgba(255, 255, 255, 0.7)",
          }}
        >
          {date}
        </div>
      </div>
    </div>
  );
}
