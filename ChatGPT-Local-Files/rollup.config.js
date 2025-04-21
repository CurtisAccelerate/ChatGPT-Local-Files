// path: rollup.config.js
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import terser from '@rollup/plugin-terser';

export default {
  input: 'content.js',
  output: {
    file: 'dist/content.bundle.js',
    format: 'iife',      // Immediately‑Invoked Function Expression
    sourcemap: true      // preserve mapping back to your modules
  },
  plugins: [
    resolve(),           // locate and bundle your ES modules
    commonjs(),          // convert CommonJS deps to ES
    terser()             // optional: minify the bundle
  ]
};
