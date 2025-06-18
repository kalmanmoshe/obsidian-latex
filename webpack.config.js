import path from "path";
import TerserPlugin from "terser-webpack-plugin";

export default {
  entry: "./main.js", // Your main entry file
  output: {
    filename: "main.min.js",
    path: path.resolve(__dirname, "dist"), // Output folder
  },
  mode: "production",
  module: {
    rules: [
      {
        test: /\.txt$/, // Any `.txt` file will be processed
        type: "asset/resource", // Webpack will copy the file and return a URL
      },
    ],
  },
  optimization: {
    minimize: true,
    minimizer: [new TerserPlugin()],
  },
  externals: {
    obsidian: "obsidian", // Tells Webpack to ignore 'obsidian' module
  },
};
