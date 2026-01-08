import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';
import terser from '@rollup/plugin-terser';

const production = !process.env.ROLLUP_WATCH;

export default {
  input: 'src/index.ts',
  output: [
    {
      file: 'dist/fusedmaps.umd.js',
      format: 'umd',
      name: 'FusedMaps',
      sourcemap: true,
      globals: {
        'mapbox-gl': 'mapboxgl',
        'h3-js': 'h3',
        'deck.gl': 'deck',
        '@deck.gl/core': 'deck',
        '@deck.gl/layers': 'deck',
        '@deck.gl/geo-layers': 'deck.GeoLayers',
        '@deck.gl/mapbox': 'deck',
        '@deck.gl/carto': 'deck.carto'
      }
    },
    {
      file: 'dist/fusedmaps.esm.js',
      format: 'esm',
      sourcemap: true
    }
  ],
  external: [
    'mapbox-gl',
    'h3-js',
    'deck.gl',
    '@deck.gl/core',
    '@deck.gl/layers',
    '@deck.gl/geo-layers',
    '@deck.gl/mapbox',
    '@deck.gl/carto'
  ],
  plugins: [
    resolve({
      browser: true,
      preferBuiltins: false
    }),
    commonjs(),
    typescript({
      tsconfig: './tsconfig.json',
      declaration: true,
      declarationDir: './dist/types'
    }),
    production && terser({
      compress: {
        drop_console: false,
        passes: 2
      },
      format: {
        comments: false
      }
    })
  ].filter(Boolean)
};






