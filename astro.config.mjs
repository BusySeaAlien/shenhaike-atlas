import cloudflare from "@astrojs/cloudflare";
import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://atlas.shenhaike.com",
  output: "server",
  trailingSlash: "always",
  adapter: cloudflare({
    imageService: "compile",
  }),
  session: false,
});
