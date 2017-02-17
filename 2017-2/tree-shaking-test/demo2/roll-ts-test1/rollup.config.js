import babel from 'rollup-plugin-babel';

export default {
  entry: 'src/entry.js',
  format: 'cjs',
   plugins: [ babel() ],
  dest: 'dist/entry.js' // equivalent to --output
};