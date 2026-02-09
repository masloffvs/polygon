import { swagger } from "@elysiajs/swagger";
import { Resvg } from "@resvg/resvg-js";
import { Elysia } from "elysia";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import satori from "satori";

const app = new Elysia()
  .use(swagger())
  .get("/", () => "Imagen API is running 🎨")

  // List all templates
  .get("/templates", async () => {
    const templatesDir = join(import.meta.dir, "../templates");
    try {
      const items = await readdir(templatesDir, { withFileTypes: true });
      return items
        .filter((item) => item.isDirectory())
        .map((item) => item.name);
    } catch (_e) {
      return { error: "Could not list templates" };
    }
  })

  // Get template schema
  .get("/templates/:id", async ({ params: { id } }) => {
    try {
      const schemaPath = join(
        import.meta.dir,
        `../templates/${id}/schema.json`,
      );
      const schema = await Bun.file(schemaPath).json();
      return schema;
    } catch (_e) {
      return { error: `Template '${id}' not found or missing schema.json` };
    }
  })

  // Generate image
  .post("/generate/:id", async ({ params: { id }, body }) => {
    console.log(`Generating image for template: ${id}`);
    try {
      // 1. Load Template Component and Config
      const templatePath = join(
        import.meta.dir,
        `../templates/${id}/index.tsx`,
      );
      const mod = await import(templatePath);
      const Template = mod.default;
      const config = mod.config || {};

      if (!Template) {
        throw new Error("Template does not export a default component");
      }

      // 2. Prepare Props
      // Merge defaults from schema with body?
      // For now, allow body to override defaults in component.
      const props = body || {};

      // 3. Prepare Fonts
      const fontDataList = [];
      if (config.fonts) {
        for (const font of config.fonts) {
          console.log(`Fetching font: ${font.name}`);
          // Basic Caching could be added here
          const resp = await fetch(font.url);
          if (!resp.ok) throw new Error(`Failed to fetch font ${font.name}`);
          const arrayBuffer = await resp.arrayBuffer();

          fontDataList.push({
            name: font.name,
            data: arrayBuffer,
            weight: font.weight || 400,
            style: font.style || "normal",
          });
        }
      }

      // 4. Render with Satori
      const width = config.width || 800;
      const height = config.height || 400;

      const svg = await satori(<Template {...props} />, {
        width,
        height,
        fonts: fontDataList,
      });

      // 5. Render to PNG with Resvg
      const resvg = new Resvg(svg, {
        fitTo: { mode: "width", value: width },
      });
      const pngData = resvg.render();
      const pngBuffer = pngData.asPng();

      return new Response(pngBuffer, {
        headers: {
          "Content-Type": "image/png",
        },
      });
    } catch (error) {
      console.error(error);
      return { error: `Generation failed: ${error.message}` };
    }
  });

app.listen(3000);

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`,
);
