const fs = require("node:fs/promises");
const path = require("node:path");
const esbuild = require("esbuild");

const root = __dirname;
const output = path.join(root, "dist");

async function build() {
  await fs.rm(output, { recursive: true, force: true });
  await fs.mkdir(output, { recursive: true });
  await Promise.all([
    fs.copyFile(path.join(root, "public", "index.html"), path.join(output, "index.html")),
    fs.copyFile(path.join(root, "public", "styles.css"), path.join(output, "styles.css"))
  ]);
  await esbuild.build({
    entryPoints: [path.join(root, "public", "app.js")],
    outfile: path.join(output, "app.js"),
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2020",
    minify: true,
    define: {
      "import.meta.env.VITE_NEON_AUTH_URL": JSON.stringify(process.env.VITE_NEON_AUTH_URL || "")
    }
  });
}

build().catch((error) => {
  console.error("Build failed:", error);
  process.exitCode = 1;
});
