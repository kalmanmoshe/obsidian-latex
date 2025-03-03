"use strict";
function wrap(middleware, callback) {
  let called;
  return wrapped;
  function wrapped(...parameters) {
    const fnExpectsCallback = middleware.length > parameters.length;
    let result;
    if (fnExpectsCallback) {
      parameters.push(done);
    }
    try {
      result = middleware.apply(this, parameters);
    } catch (error) {
      const exception = (
        /** @type {Error} */
        error
      );
      if (fnExpectsCallback && called) {
        throw exception;
      }
      return done(exception);
    }
    if (!fnExpectsCallback) {
      if (result && result.then && typeof result.then === "function") {
        result.then(then, done);
      } else if (result instanceof Error) {
        done(result);
      } else {
        then(result);
      }
    }
  }
  function done(error, ...output) {
    if (!called) {
      called = true;
      callback(error, ...output);
    }
  }
  function then(value) {
    done(null, value);
  }
}
function lintRule(meta, rule) {
  const id = typeof meta === "string" ? meta : meta.origin;
  const url = typeof meta === "string" ? void 0 : meta.url;
  const parts = id.split(":");
  const source = parts[1] ? parts[0] : void 0;
  const ruleId = parts[1];
  Object.defineProperty(plugin, "name", { value: id });
  return plugin;
  function plugin(config) {
    const [severity, options] = coerce(ruleId, config);
    if (!severity) return;
    const fatal = severity === 2;
    return (tree, file, next) => {
      let index = file.messages.length - 1;
      wrap(rule, (error) => {
        const messages = file.messages;
        if (error && !messages.includes(error)) {
          try {
            file.fail(error);
          } catch {
          }
        }
        while (++index < messages.length) {
          Object.assign(messages[index], { ruleId, source, fatal, url });
        }
        next();
      })(tree, file, options);
    };
  }
}
function coerce(name, config) {
  if (!Array.isArray(config)) return [1, config];
  const [severity, ...options] = config;
  switch (severity) {
    case false:
    case "off":
    case 0: {
      return [0, ...options];
    }
    case true:
    case "on":
    case "warn":
    case 1: {
      return [1, ...options];
    }
    case "error":
    case 2: {
      return [2, ...options];
    }
    default: {
      if (typeof severity !== "number") return [1, config];
      throw new Error(
        "Incorrect severity `" + severity + "` for `" + name + "`, expected 0, 1, or 2"
      );
    }
  }
}
exports.lintRule = lintRule;
//# sourceMappingURL=index-CvNqyD-G.cjs.map
