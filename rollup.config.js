import svelte from "rollup-plugin-svelte";
import meta from "userscript-meta-cli";
import resolve from "@rollup/plugin-node-resolve";

export default {
  input: "src/index.js",
  output: {
    file: "dist/wakfupedia-builder.user.js",
    format: "esm",
    banner: meta.stringify(meta.getMeta())
  },
  plugins: [
    resolve({browser: true}),
    svelte({
      emitCss: false
    })
  ]
};
