import path from 'path';
import TerserPlugin from 'terser-webpack-plugin';

export default {
  entry: './main.js', // Your main entry file
  output: {
    filename: 'main.min.js',
    path: path.resolve(__dirname, 'dist'), // Output folder
  },
  mode: 'production',
  optimization: {
    minimize: true,
    minimizer: [new TerserPlugin()],
  },
  externals: {
    obsidian: 'obsidian', // Tells Webpack to ignore 'obsidian' module
  },
};
