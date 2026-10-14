const fs = require('fs');
const path = require('path');
const webpack = require('webpack');
const version = require('./package.json').version;
const widgetVersion = version.split('.').slice(0, 2).join('.');

function publishMapWorker() {
  const source = path.join(__dirname, 'node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs');
  const target = path.join(__dirname, 'public/maplibre-gl-worker.mjs');
  fs.copyFileSync(source, target);
}

module.exports = function override(config, env) {
  publishMapWorker();
  config.resolve.fallback = {
    ...config.resolve.fallback,
    stream: require.resolve('stream-browserify'),
    buffer: require.resolve('buffer'),
    url: require.resolve('url/'),
    http: require.resolve('stream-http'),
    https: require.resolve('https-browserify'),
    'process/browser': require.resolve('process/browser'),
  };

  config.resolve.extensions = [...config.resolve.extensions, '.ts', '.js', '.cjs'];
  config.plugins = [
    ...config.plugins,
    new webpack.ProvidePlugin({
      process: 'process/browser',
      Buffer: ['buffer', 'Buffer'],
    }),
  ];
  config.output = {
    ...config.output,
    // Content-hashed WASM belongs under static/, where public/_headers already caches
    // fingerprinted assets; without this the file lands in the build root, which no rule
    // covers.
    webassemblyModuleFilename: 'static/wasm/[hash].module.wasm',
    ...(process.env.REACT_APP_PUBLIC_URL && process.env.CUSTOM_CHUNK_PATH
      ? {
          publicPath: new URL(process.env.CUSTOM_CHUNK_PATH, process.env.REACT_APP_PUBLIC_URL).href,
          chunkFilename: config.output.chunkFilename.replace('static/js', `v${widgetVersion}-chunks`),
          webassemblyModuleFilename: `v${widgetVersion}-chunks/[hash].module.wasm`,
        }
      : undefined),
  };

  if (process.env.REACT_APP_PUBLIC_URL && process.env.CUSTOM_CHUNK_PATH) {
    const cssPlugin = config.plugins.find((plugin) => plugin.constructor.name === 'MiniCssExtractPlugin');
    if (cssPlugin && cssPlugin.options) {
      cssPlugin.options.chunkFilename = cssPlugin.options.chunkFilename.replace(
        'static/css',
        `v${widgetVersion}-chunks`,
      );
    }
  }

  // add support for WASM
  const wasmExtensionRegExp = /\.wasm$/;
  config.resolve.extensions.push('.wasm');
  config.module.rules.forEach((rule) => {
    (rule.oneOf || []).forEach((oneOf) => {
      if (oneOf.type === 'asset/resource') {
        oneOf.exclude.push(wasmExtensionRegExp);
      }
    });
  });
  config.module.rules.push({
    test: wasmExtensionRegExp,
    include: path.resolve(__dirname, 'src'),
    use: [{ loader: require.resolve('wasm-loader'), options: {} }],
  });
  config.experiments = {
    asyncWebAssembly: true,
  };

  return config;
};
