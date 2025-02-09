
export function Parser() {
    //Point to the local parser instead of the global one
    var _ = this;
    var bin = {};
    var preprocessors = { names: [], actions: [] };

    //Parser.classes ===============================================================
    function Slice(upper, lower) {
      this.start = upper;
      this.end = lower;
    }
    Slice.prototype.isConstant = function () {
      return this.start.isConstant() && this.end.isConstant();
    };
    Slice.prototype.text = function () {
      return text(this.start) + ":" + text(this.end);
    };

    function Token(node, node_type, column) {
      this.type = node_type;
      this.value = node;
      if (column !== undefined) this.column = column + 1;
      if (node_type === Token.OPERATOR) {
        //copy everything over from the operator
        var operator = operators[node];
        for (var x in operator) this[x] = operator[x];
      } else if (node_type === Token.FUNCTION) {
        this.precedence = Token.MAX_PRECEDENCE; //leave enough roon
        this.leftAssoc = false;
      }
    }
    Token.prototype.toString = function () {
      return this.value;
    };
    Token.prototype.toString = function () {
      if (this.is_prefix) return "`" + this.value;
      return this.value;
    };
    //some constants
    Token.OPERATOR = "OPERATOR";
    Token.VARIABLE_OR_LITERAL = "VARIABLE_OR_LITERAL";
    Token.FUNCTION = "FUNCTION";
    Token.UNIT = "UNIT";
    Token.KEYWORD = "KEYWORD";
    Token.MAX_PRECEDENCE = 999;
    //create link to classes
    this.classes = {
      Collection: Collection,
      Slice: Slice,
      Token: Token,
    };
    //Parser.modules ===============================================================
    //object for functions which handle complex number
    var complex = {
      prec: undefined,
      cos: function (r, i) {
        var re, im;
        re = _.parse(Math.cos(r) * Math.cosh(i));
        im = _.parse(Math.sin(r) * Math.sinh(i));
        return _.subtract(re, _.multiply(im, Symbol.imaginary()));
      },
      sin: function (r, i) {
        var re, im;
        re = _.parse(Math.sin(r) * Math.cosh(i));
        im = _.parse(Math.cos(r) * Math.sinh(i));
        return _.subtract(re, _.multiply(im, Symbol.imaginary()));
      },
      tan: function (r, i) {
        var re, im;
        re = _.parse(Math.sin(2 * r) / (Math.cos(2 * r) + Math.cosh(2 * i)));
        im = _.parse(Math.sinh(2 * i) / (Math.cos(2 * r) + Math.cosh(2 * i)));
        return _.add(re, _.multiply(im, Symbol.imaginary()));
      },
      sec: function (r, i) {
        var t = this.removeDen(this.cos(r, i));
        return _.subtract(t[0], _.multiply(t[1], Symbol.imaginary()));
      },
      csc: function (r, i) {
        var t = this.removeDen(this.sin(r, i));
        return _.add(t[0], _.multiply(t[1], Symbol.imaginary()));
      },
      cot: function (r, i) {
        var t = this.removeDen(this.tan(r, i));
        return _.subtract(t[0], _.multiply(t[1], Symbol.imaginary()));
      },
      acos: function (r, i) {
        var symbol, sq, a, b, c, squared;
        symbol = this.fromArray([r, i]);
        squared = _.pow(symbol.clone(), new Symbol(2));
        sq = _.expand(squared); //z*z
        a = _.multiply(sqrt(_.subtract(new Symbol(1), sq)), Symbol.imaginary());
        b = _.expand(_.add(symbol.clone(), a));
        c = log(b);
        return _.expand(_.multiply(Symbol.imaginary().negate(), c));
      },
      asin: function (r, i) {
        return _.subtract(_.parse("pi/2"), this.acos(r, i));
      },
      atan: function (r, i) {
        // Handle i and -i
        if (r.equals(0) && (i.equals(1) || i.equals(-1))) {
          // Just copy Wolfram Alpha for now. The parenthesis
          return _.parse(`${Symbol.infinity()}*${Settings.IMAGINARY}*${i}`);
        }
        var a, b, c, symbol;
        symbol = complex.fromArray([r, i]);
        a = _.expand(_.multiply(Symbol.imaginary(), symbol.clone()));
        b = log(_.expand(_.subtract(new Symbol(1), a.clone())));
        c = log(_.expand(_.add(new Symbol(1), a.clone())));
        return _.expand(
          _.multiply(
            _.divide(Symbol.imaginary(), new Symbol(2)),
            _.subtract(b, c),
          ),
        );
      },
      asec: function (r, i) {
        var d = this.removeDen([r, i]);
        d[1].negate();
        return this.acos.apply(this, d);
      },
      acsc: function (r, i) {
        var d = this.removeDen([r, i]);
        d[1].negate();
        return this.asin.apply(this, d);
      },
      acot: function (r, i) {
        var d = this.removeDen([r, i]);
        d[1].negate();
        return this.atan.apply(this, d);
      },
      //Hyperbolic trig
      cosh: function (r, i) {
        var re, im;
        re = _.parse(Math.cosh(r) * Math.cos(i));
        im = _.parse(Math.sinh(r) * Math.sin(i));
        return _.add(re, _.multiply(im, Symbol.imaginary()));
      },
      sinh: function (r, i) {
        var re, im;
        re = _.parse(Math.sinh(r) * Math.cos(i));
        im = _.parse(Math.cosh(r) * Math.sin(i));
        return _.add(re, _.multiply(im, Symbol.imaginary()));
      },
      tanh: function (r, i) {
        var re, im;
        re = _.parse(Math.sinh(2 * r) / (Math.cos(2 * i) + Math.cosh(2 * r)));
        im = _.parse(Math.sin(2 * i) / (Math.cos(2 * i) + Math.cosh(2 * r)));
        return _.subtract(re, _.multiply(im, Symbol.imaginary()));
      },
      sech: function (r, i) {
        var t = this.removeDen(this.cosh(r, i));
        return _.subtract(t[0], _.multiply(t[1], Symbol.imaginary()));
      },
      csch: function (r, i) {
        var t = this.removeDen(this.sinh(r, i));
        return _.subtract(t[0], _.multiply(t[1], Symbol.imaginary()));
      },
      coth: function (r, i) {
        var t = this.removeDen(this.tanh(r, i));
        return _.add(t[0], _.multiply(t[1], Symbol.imaginary()));
      },
      acosh: function (r, i) {
        var a, b, z;
        z = this.fromArray([r, i]);
        a = sqrt(_.add(z.clone(), new Symbol(1)));
        b = sqrt(_.subtract(z.clone(), new Symbol(1)));
        return _.expand(log(_.add(z, _.expand(_.multiply(a, b)))));
      },
      asinh: function (r, i) {
        var a, z;
        z = this.fromArray([r, i]);
        a = sqrt(
          _.add(new Symbol(1), _.expand(_.pow(z.clone(), new Symbol(2)))),
        );
        return _.expand(log(_.add(z, a)));
      },
      atanh: function (r, i) {
        var a, b, z;
        z = this.fromArray([r, i]);
        a = log(_.add(z.clone(), new Symbol(1)));
        b = log(_.subtract(new Symbol(1), z));
        return _.expand(_.divide(_.subtract(a, b), new Symbol(2)));
      },
      asech: function (r, i) {
        var t = this.removeDen([r, i]);
        t[1].negate();
        return this.acosh.apply(this, t);
      },
      acsch: function (r, i) {
        var t = this.removeDen([r, i]);
        t[1].negate();
        return this.asinh.apply(this, t);
      },
      acoth: function (r, i) {
        var t = this.removeDen([r, i]);
        t[1].negate();
        return this.atanh.apply(this, t);
      },
      sqrt: function (symbol) {
        var re, im, h, a, d;
        re = symbol.realpart();
        im = symbol.imagpart();
        h = Symbol.hyp(re, im);
        a = _.add(re.clone(), h);
        d = sqrt(_.multiply(new Symbol(2), a.clone()));
        return _.add(
          _.divide(a.clone(), d.clone()),
          _.multiply(_.divide(im, d), Symbol.imaginary()),
        );
      },
      log: function (r, i) {
        var re, im, phi;
        re = log(Symbol.hyp(r, i));
        phi = Settings.USE_BIG
          ? Symbol(
              bigDec.atan2(i.multiplier.toDecimal(), r.multiplier.toDecimal()),
            )
          : Math.atan2(i, r);
        im = _.parse(phi);
        return _.add(re, _.multiply(Symbol.imaginary(), im));
      },
      erf(symbol, n) {
        //Do nothing for now. Revisit this in the future.
        return _.symfunction("erf", [symbol]);

        n = n || 30;

        var f = function (R, I) {
          return block(
            "PARSE2NUMBER",
            function () {
              var retval = new Symbol(0);
              for (var i = 0; i < n; i++) {
                var a, b;
                a = _.parse(
                  bigDec.exp(
                    bigDec(i)
                      .toPower(2)
                      .neg()
                      .dividedBy(
                        bigDec(n).pow(2).plus(bigDec(R).toPower(2).times(4)),
                      ),
                  ),
                );
                b = _.parse(
                  format(
                    "2*({1})-e^(-(2*{0}*{1}*{2}))*(2*{1}*cosh({2}*{3})-{0}*{3}*sinh({3}*{2}))",
                    Settings.IMAGINARY,
                    R,
                    I,
                    i,
                  ),
                );
                retval = _.add(retval, _.multiply(a, b));
              }
              return _.multiply(retval, new Symbol(2));
            },
            true,
          );
        };
        var re, im, a, b, c, k;
        re = symbol.realpart();
        im = symbol.imagpart();

        k = _.parse(format("(e^(-{0}^2))/pi", re));
        a = _.parse(
          format(
            "(1-e^(-(2*{0}*{1}*{2})))/(2*{1})",
            Settings.IMAGINARY,
            re,
            im,
          ),
        );
        b = f(re.toString(), im.toString());

        return _.add(
          _.parse(Math2.erf(re.toString())),
          _.multiply(k, _.add(a, b)),
        );
      },
      removeDen: function (symbol) {
        var den, r, i, re, im;
        if (isArray(symbol)) {
          r = symbol[0];
          i = symbol[1];
        } else {
          r = symbol.realpart();
          i = symbol.imagpart();
        }

        den = Math.pow(r, 2) + Math.pow(i, 2);
        re = _.parse(r / den);
        im = _.parse(i / den);
        return [re, im];
      },
      fromArray: function (arr) {
        return _.add(arr[0], _.multiply(Symbol.imaginary(), arr[1]));
      },
      evaluate: function (symbol, f) {
        var re, im, sign;

        sign = symbol.power.sign();
        //remove it from under the denominator
        symbol.power = symbol.power.abs();
        //expand
        if (symbol.power.greaterThan(1)) symbol = _.expand(symbol);
        //remove the denominator
        if (sign < 0) {
          var d = this.removeDen(symbol);
          re = d[0];
          im = d[1];
        } else {
          re = symbol.realpart();
          im = symbol.imagpart();
        }

        if (re.isConstant("all") && im.isConstant("all"))
          return this[f].call(this, re, im);

        return _.symfunction(f, [symbol]);
      },
    };
    //object for functions which handle trig
    var trig = (this.trig = {
      //container for trigonometric function
      cos: function (symbol) {
        if (symbol.equals("pi") && symbol.multiplier.den.equals(2))
          return new Symbol(0);

        if (Settings.PARSE2NUMBER) {
          if (symbol.equals(new Symbol(Settings.PI / 2))) return new Symbol(0);
          if (symbol.isConstant()) {
            if (Settings.USE_BIG) {
              return new Symbol(bigDec.cos(symbol.multiplier.toDecimal()));
            }

            return new Symbol(Math.cos(symbol.valueOf()));
          }
          if (symbol.isImaginary()) {
            return complex.evaluate(symbol, "cos");
          }
        }
        if (symbol.equals(0)) return new Symbol(1);

        var retval,
          c = false,
          q = getQuadrant(symbol.multiplier.toDecimal()),
          m = symbol.multiplier.abs();
        symbol.multiplier = m;

        if (symbol.isPi() && symbol.isLinear()) {
          //return for 1 or -1 for multiples of pi
          if (isInt(m)) {
            retval = new Symbol(even(m) ? 1 : -1);
          } else {
            var n = Number(m.num),
              d = Number(m.den);
            if (d === 2) retval = new Symbol(0);
            else if (d === 3) {
              retval = _.parse("1/2");
              c = true;
            } else if (d === 4) {
              retval = _.parse("1/sqrt(2)");
              c = true;
            } else if (d === 6) {
              retval = _.parse("sqrt(3)/2");
              c = true;
            } else retval = _.symfunction("cos", [symbol]);
          }
        }

        if (c && (q === 2 || q === 3)) retval.negate();

        if (!retval) retval = _.symfunction("cos", [symbol]);

        return retval;
      },
      sin: function (symbol) {
        if (Settings.PARSE2NUMBER) {
          if (symbol.isConstant()) {
            if (symbol % Math.PI === 0) {
              return new Symbol(0);
            }

            if (Settings.USE_BIG) {
              return new Symbol(bigDec.sin(symbol.multiplier.toDecimal()));
            }

            return new Symbol(Math.sin(symbol.valueOf()));
          }
          if (symbol.isImaginary()) return complex.evaluate(symbol, "sin");
        }

        if (symbol.equals(0)) return new Symbol(0);

        var retval,
          c = false,
          q = getQuadrant(symbol.multiplier.toDecimal()),
          sign = symbol.multiplier.sign(),
          m = symbol.multiplier.abs();
        symbol.multiplier = m;
        if (symbol.equals("pi")) retval = new Symbol(0);
        else if (symbol.isPi() && symbol.isLinear()) {
          //return for 0 for multiples of pi
          if (isInt(m)) {
            retval = new Symbol(0);
          } else {
            var n = m.num,
              d = m.den;
            if (d == 2) {
              retval = new Symbol(1);
              c = true;
            } else if (d == 3) {
              retval = _.parse("sqrt(3)/2");
              c = true;
            } else if (d == 4) {
              retval = _.parse("1/sqrt(2)");
              c = true;
            } else if (d == 6) {
              retval = _.parse("1/2");
              c = true;
            } else
              retval = _.multiply(
                new Symbol(sign),
                _.symfunction("sin", [symbol]),
              );
          }
        }

        if (!retval)
          retval = _.multiply(new Symbol(sign), _.symfunction("sin", [symbol]));

        if (c && (q === 3 || q === 4)) retval.negate();

        return retval;
      },
      tan: function (symbol) {
        if (Settings.PARSE2NUMBER) {
          if (symbol % Math.PI === 0 && symbol.isLinear()) {
            return new Symbol(0);
          }
          if (symbol.isConstant()) {
            if (Settings.USE_BIG) {
              return new Symbol(bigDec.tan(symbol.multiplier.toDecimal()));
            }

            return new Symbol(Math.tan(symbol.valueOf()));
          }
          if (symbol.isImaginary()) return complex.evaluate(symbol, "tan");
        }
        var retval,
          c = false,
          q = getQuadrant(symbol.multiplier.toDecimal()),
          m = symbol.multiplier;

        symbol.multiplier = m;

        if (symbol.isPi() && symbol.isLinear()) {
          //return 0 for all multiples of pi
          if (isInt(m)) {
            retval = new Symbol(0);
          } else {
            var n = m.num,
              d = m.den;
            if (d == 2)
              throw new UndefinedError(
                "tan is undefined for " + symbol.toString(),
              );
            else if (d == 3) {
              retval = _.parse("sqrt(3)");
              c = true;
            } else if (d == 4) {
              retval = new Symbol(1);
              c = true;
            } else if (d == 6) {
              retval = _.parse("1/sqrt(3)");
              c = true;
            } else retval = _.symfunction("tan", [symbol]);
          }
        }

        if (!retval) retval = _.symfunction("tan", [symbol]);

        if (c && (q === 2 || q === 4)) retval.negate();

        return retval;
      },
      sec: function (symbol) {
        if (Settings.PARSE2NUMBER) {
          if (symbol.isConstant()) {
            if (Settings.USE_BIG) {
              return new Symbol(
                new bigDec(1).dividedBy(
                  bigDec.cos(symbol.multiplier.toDecimal()),
                ),
              );
            }

            return new Symbol(Math2.sec(symbol.valueOf()));
          }
          if (symbol.isImaginary()) return complex.evaluate(symbol, "sec");
          return _.parse(format("1/cos({0})", symbol));
        }

        var retval,
          c = false,
          q = getQuadrant(symbol.multiplier.toDecimal()),
          m = symbol.multiplier.abs();
        symbol.multiplier = m;

        if (symbol.isPi() && symbol.isLinear()) {
          //return for 1 or -1 for multiples of pi
          if (isInt(m)) {
            retval = new Symbol(even(m) ? 1 : -1);
          } else {
            var n = m.num,
              d = m.den;
            if (d == 2)
              throw new UndefinedError(
                "sec is undefined for " + symbol.toString(),
              );
            else if (d == 3) {
              retval = new Symbol(2);
              c = true;
            } else if (d == 4) {
              retval = _.parse("sqrt(2)");
              c = true;
            } else if (d == 6) {
              retval = _.parse("2/sqrt(3)");
              c = true;
            } else retval = _.symfunction("sec", [symbol]);
          }
        }

        if (c && (q === 2 || q === 3)) retval.negate();

        if (!retval) retval = _.symfunction("sec", [symbol]);

        return retval;
      },
      csc: function (symbol) {
        if (Settings.PARSE2NUMBER) {
          if (symbol.isConstant()) {
            if (Settings.USE_BIG) {
              return new Symbol(
                new bigDec(1).dividedBy(
                  bigDec.sin(symbol.multiplier.toDecimal()),
                ),
              );
            }

            return new Symbol(Math2.csc(symbol.valueOf()));
          }
          if (symbol.isImaginary()) return complex.evaluate(symbol, "csc");
          return _.parse(format("1/sin({0})", symbol));
        }

        var retval,
          c = false,
          q = getQuadrant(symbol.multiplier.toDecimal()),
          sign = symbol.multiplier.sign(),
          m = symbol.multiplier.abs();

        symbol.multiplier = m;

        if (symbol.isPi() && symbol.isLinear()) {
          //return for 0 for multiples of pi
          if (isInt(m)) {
            throw new UndefinedError(
              "csc is undefined for " + symbol.toString(),
            );
          } else {
            var n = m.num,
              d = m.den;
            if (d == 2) {
              retval = new Symbol(1);
              c = true;
            } else if (d == 3) {
              retval = _.parse("2/sqrt(3)");
              c = true;
            } else if (d == 4) {
              retval = _.parse("sqrt(2)");
              c = true;
            } else if (d == 6) {
              retval = new Symbol(2);
              c = true;
            } else
              retval = _.multiply(
                new Symbol(sign),
                _.symfunction("csc", [symbol]),
              );
          }
        }

        if (!retval)
          retval = _.multiply(new Symbol(sign), _.symfunction("csc", [symbol]));

        if (c && (q === 3 || q === 4)) retval.negate();

        return retval;
      },
      cot: function (symbol) {
        if (Settings.PARSE2NUMBER) {
          if (symbol % (Math.PI / 2) === 0) {
            return new Symbol(0);
          }
          if (symbol.isConstant()) {
            if (Settings.USE_BIG) {
              return new Symbol(
                new bigDec(1).dividedBy(
                  bigDec.tan(symbol.multiplier.toDecimal()),
                ),
              );
            }

            return new Symbol(Math2.cot(symbol.valueOf()));
          }
          if (symbol.isImaginary()) return complex.evaluate(symbol, "cot");
          return _.parse(format("1/tan({0})", symbol));
        }
        var retval,
          c = false,
          q = getQuadrant(symbol.multiplier.toDecimal()),
          m = symbol.multiplier;

        symbol.multiplier = m;

        if (symbol.isPi() && symbol.isLinear()) {
          //return 0 for all multiples of pi
          if (isInt(m)) {
            throw new UndefinedError(
              "cot is undefined for " + symbol.toString(),
            );
          } else {
            var n = m.num,
              d = m.den;
            if (d == 2) retval = new Symbol(0);
            else if (d == 3) {
              retval = _.parse("1/sqrt(3)");
              c = true;
            } else if (d == 4) {
              retval = new Symbol(1);
              c = true;
            } else if (d == 6) {
              retval = _.parse("sqrt(3)");
              c = true;
            } else retval = _.symfunction("cot", [symbol]);
          }
        }

        if (!retval) retval = _.symfunction("cot", [symbol]);

        if (c && (q === 2 || q === 4)) retval.negate();

        return retval;
      },
      acos: function (symbol) {
        if (Settings.PARSE2NUMBER) {
          if (symbol.isConstant()) {
            // Handle values in the complex domain
            if (symbol.gt(1) || symbol.lt(-1)) {
              var x = symbol.toString();
              return expand(evaluate(`pi/2-asin(${x})`));
            }
            // Handle big numbers
            if (Settings.USE_BIG) {
              return new Symbol(bigDec.acos(symbol.multiplier.toDecimal()));
            }

            return new Symbol(Math.acos(symbol.valueOf()));
          }
          if (symbol.isImaginary()) return complex.evaluate(symbol, "acos");
        }
        return _.symfunction("acos", arguments);
      },
      asin: function (symbol) {
        if (Settings.PARSE2NUMBER) {
          if (symbol.isConstant()) {
            // Handle values in the complex domain
            if (symbol.gt(1) || symbol.lt(-1)) {
              var i = Settings.IMAGINARY;
              var x = symbol.multiplier.toDecimal();
              return expand(evaluate(`${i}*log(sqrt(1-${x}^2)-${i}*${x})`));
            }
            // Handle big numbers
            if (Settings.USE_BIG) {
              return new Symbol(bigDec.asin(symbol.multiplier.toDecimal()));
            }

            return new Symbol(Math.asin(symbol.valueOf()));
          }
          if (symbol.isImaginary()) return complex.evaluate(symbol, "asin");
        }
        return _.symfunction("asin", arguments);
      },
      atan: function (symbol) {
        var retval;
        if (symbol.equals(0)) retval = new Symbol(0);
        else if (Settings.PARSE2NUMBER) {
          if (symbol.isConstant()) {
            // Handle big numbers
            if (Settings.USE_BIG) {
              return new Symbol(bigDec.atan(symbol.multiplier.toDecimal()));
            }

            return new Symbol(Math.atan(symbol.valueOf()));
          }
          if (symbol.isImaginary()) return complex.evaluate(symbol, "atan");
          return _.symfunction("atan", arguments);
        } else if (symbol.equals(-1)) retval = _.parse("-pi/4");
        else retval = _.symfunction("atan", arguments);
        return retval;
      },
      asec: function (symbol) {
        if (Settings.PARSE2NUMBER) {
          if (symbol.equals(0)) {
            throw new OutOfFunctionDomainError(
              "Input is out of the domain of sec!",
            );
          }
          if (symbol.isConstant()) {
            return trig.acos(symbol.invert());
          }
          if (symbol.isImaginary()) {
            return complex.evaluate(symbol, "asec");
          }
        }
        return _.symfunction("asec", arguments);
      },
      acsc: function (symbol) {
        if (Settings.PARSE2NUMBER) {
          if (symbol.isConstant()) {
            return trig.asin(symbol.invert());
          }

          if (symbol.isImaginary()) return complex.evaluate(symbol, "acsc");
        }
        return _.symfunction("acsc", arguments);
      },
      acot: function (symbol) {
        if (Settings.PARSE2NUMBER) {
          if (symbol.isConstant()) {
            return new _.add(_.parse("pi/2"), trig.atan(symbol).negate());
          }

          if (symbol.isImaginary()) return complex.evaluate(symbol, "acot");
        }
        return _.symfunction("acot", arguments);
      },
      atan2: function (a, b) {
        if (a.equals(0) && b.equals(0))
          throw new UndefinedError("atan2 is undefined for 0, 0");

        if (Settings.PARSE2NUMBER && a.isConstant() && b.isConstant()) {
          return new Symbol(Math.atan2(a, b));
        }
        return _.symfunction("atan2", arguments);
      },
    });
    //object for functions which handle hyperbolic trig
    var trigh = (this.trigh = {
      //container for hyperbolic trig function
      cosh: function (symbol) {
        var retval;
        if (Settings.PARSE2NUMBER) {
          if (symbol.isConstant())
            return new Symbol(Math.cosh(symbol.valueOf()));
          if (symbol.isImaginary()) {
            return complex.evaluate(symbol, "cosh");
          }
        }

        return (retval = _.symfunction("cosh", arguments));
      },
      sinh: function (symbol) {
        var retval;
        if (Settings.PARSE2NUMBER) {
          if (symbol.isConstant())
            return new Symbol(Math.sinh(symbol.valueOf()));
          if (symbol.isImaginary()) {
            return complex.evaluate(symbol, "sinh");
          }
        }

        return (retval = _.symfunction("sinh", arguments));
      },
      tanh: function (symbol) {
        var retval;
        if (Settings.PARSE2NUMBER) {
          if (symbol.isConstant())
            return new Symbol(Math.tanh(symbol.valueOf()));
          if (symbol.isImaginary()) {
            return complex.evaluate(symbol, "tanh");
          }
        }

        return (retval = _.symfunction("tanh", arguments));
      },
      sech: function (symbol) {
        var retval;
        if (Settings.PARSE2NUMBER) {
          if (symbol.isConstant()) {
            return new Symbol(Math.sech(symbol.valueOf()));
          }
          if (symbol.isImaginary()) {
            return complex.evaluate(symbol, "sech");
          }
          return _.parse(format("1/cosh({0})", symbol));
        }

        return (retval = _.symfunction("sech", arguments));
      },
      csch: function (symbol) {
        var retval;
        if (Settings.PARSE2NUMBER) {
          if (symbol.isConstant())
            return new Symbol(Math.csch(symbol.valueOf()));
          if (symbol.isImaginary()) {
            return complex.evaluate(symbol, "csch");
          }
          return _.parse(format("1/sinh({0})", symbol));
        }

        return (retval = _.symfunction("csch", arguments));
      },
      coth: function (symbol) {
        var retval;
        if (Settings.PARSE2NUMBER) {
          if (symbol.isConstant())
            return new Symbol(Math.coth(symbol.valueOf()));
          if (symbol.isImaginary()) {
            return complex.evaluate(symbol, "coth");
          }
          return _.parse(format("1/tanh({0})", symbol));
        }

        return (retval = _.symfunction("coth", arguments));
      },
      acosh: function (symbol) {
        var retval;
        if (Settings.PARSE2NUMBER && symbol.isImaginary())
          retval = complex.evaluate(symbol, "acosh");
        else if (Settings.PARSE2NUMBER)
          retval = evaluate(
            _.parse(
              format(
                Settings.LOG + "(({0})+sqrt(({0})^2-1))",
                symbol.toString(),
              ),
            ),
          );
        else retval = _.symfunction("acosh", arguments);
        return retval;
      },
      asinh: function (symbol) {
        var retval;
        if (Settings.PARSE2NUMBER && symbol.isImaginary())
          retval = complex.evaluate(symbol, "asinh");
        else if (Settings.PARSE2NUMBER)
          retval = evaluate(
            _.parse(
              format(
                Settings.LOG + "(({0})+sqrt(({0})^2+1))",
                symbol.toString(),
              ),
            ),
          );
        else retval = _.symfunction("asinh", arguments);
        return retval;
      },
      atanh: function (symbol) {
        var retval;
        if (Settings.PARSE2NUMBER && symbol.isImaginary())
          retval = complex.evaluate(symbol, "atanh");
        else if (Settings.PARSE2NUMBER) {
          retval = evaluate(
            _.parse(
              format(
                "(1/2)*" + Settings.LOG + "((1+({0}))/(1-({0})))",
                symbol.toString(),
              ),
            ),
          );
        } else retval = _.symfunction("atanh", arguments);
        return retval;
      },
      asech: function (symbol) {
        var retval;
        if (Settings.PARSE2NUMBER && symbol.isImaginary())
          retval = complex.evaluate(symbol, "asech");
        else if (Settings.PARSE2NUMBER)
          retval = evaluate(
            log(
              _.add(
                symbol.clone().invert(),
                sqrt(_.subtract(_.pow(symbol, new Symbol(-2)), new Symbol(1))),
              ),
            ),
          );
        else retval = _.symfunction("asech", arguments);
        return retval;
      },
      acsch: function (symbol) {
        var retval;
        if (Settings.PARSE2NUMBER && symbol.isImaginary())
          retval = complex.evaluate(symbol, "acsch");
        else if (Settings.PARSE2NUMBER)
          retval = evaluate(
            _.parse(
              format(
                Settings.LOG + "((1+sqrt(1+({0})^2))/({0}))",
                symbol.toString(),
              ),
            ),
          );
        else retval = _.symfunction("acsch", arguments);
        return retval;
      },
      acoth: function (symbol) {
        var retval;
        if (Settings.PARSE2NUMBER && symbol.isImaginary())
          retval = complex.evaluate(symbol, "acoth");
        else if (Settings.PARSE2NUMBER) {
          if (symbol.equals(1)) retval = Symbol.infinity();
          else
            retval = evaluate(
              _.divide(
                log(
                  _.divide(
                    _.add(symbol.clone(), new Symbol(1)),
                    _.subtract(symbol.clone(), new Symbol(1)),
                  ),
                ),
                new Symbol(2),
              ),
            );
        } else retval = _.symfunction("acoth", arguments);
        return retval;
      },
    });
    //list of supported units
    this.units = {};
    //list all the supported operators
    var operators = {
      "\\": {
        precedence: 8,
        operator: "\\",
        action: "slash",
        prefix: true,
        postfix: false,
        leftAssoc: true,
        operation: function (e) {
          return e; //bypass the slash
        },
      },
      "!!": {
        precedence: 7,
        operator: "!!",
        action: "dfactorial",
        prefix: false,
        postfix: true,
        leftAssoc: true,
        operation: function (e) {
          return _.symfunction(Settings.DOUBLEFACTORIAL, [e]); //wrap it in a factorial function
        },
      },
      "!": {
        precedence: 7,
        operator: "!",
        action: "factorial",
        prefix: false,
        postfix: true,
        leftAssoc: true,
        operation: function (e) {
          return factorial(e); //wrap it in a factorial function
        },
      },
      "^": {
        precedence: 6,
        operator: "^",
        action: "pow",
        prefix: false,
        postfix: false,
        leftAssoc: true,
      },
      "**": {
        precedence: 6,
        operator: "**",
        action: "pow",
        prefix: false,
        postfix: false,
        leftAssoc: true,
      },
      "%": {
        precedence: 4,
        operator: "%",
        action: "percent",
        prefix: false,
        postfix: true,
        leftAssoc: true,
        overloaded: true,
        overloadAction: "mod",
        overloadLeftAssoc: false,
        operation: function (x) {
          return _.divide(x, new Symbol(100));
        },
      },
      "*": {
        precedence: 4,
        operator: "*",
        action: "multiply",
        prefix: false,
        postfix: false,
        leftAssoc: false,
      },
      "/": {
        precedence: 4,
        operator: "/",
        action: "divide",
        prefix: false,
        postfix: false,
        leftAssoc: false,
      },
      "+": {
        precedence: 3,
        operator: "+",
        action: "add",
        prefix: true,
        postfix: false,
        leftAssoc: false,
        operation: function (x) {
          return x;
        },
      },
      plus: {
        precedence: 3,
        operator: "plus",
        action: "add",
        prefix: true,
        postfix: false,
        leftAssoc: false,
        operation: function (x) {
          return x;
        },
      },
      "-": {
        precedence: 3,
        operator: "-",
        action: "subtract",
        prefix: true,
        postfix: false,
        leftAssoc: false,
        operation: function (x) {
          return x.negate();
        },
      },
      "=": {
        precedence: 2,
        operator: "=",
        action: "equals",
        prefix: false,
        postfix: false,
        leftAssoc: false,
      },
      "==": {
        precedence: 1,
        operator: "==",
        action: "eq",
        prefix: false,
        postfix: false,
        leftAssoc: false,
      },
      "<": {
        precedence: 1,
        operator: "<",
        action: "lt",
        prefix: false,
        postfix: false,
        leftAssoc: false,
      },
      "<=": {
        precedence: 1,
        operator: "<=",
        action: "lte",
        prefix: false,
        postfix: false,
        leftAssoc: false,
      },
      ">": {
        precedence: 1,
        operator: ">",
        action: "gt",
        prefix: false,
        postfix: false,
        leftAssoc: false,
      },
      "=>": {
        precedence: 1,
        operator: "=>",
        action: "gte",
        prefix: false,
        postfix: false,
        leftAssoc: false,
      },
      ",": {
        precedence: 0,
        operator: ",",
        action: "comma",
        prefix: false,
        postfix: false,
        leftAssoc: false,
      },
      ":": {
        precedence: 0,
        operator: ",",
        action: "assign",
        prefix: false,
        postfix: false,
        leftAssoc: false,
        vectorFn: "slice",
      },
      ":=": {
        precedence: 0,
        operator: ",",
        action: "function_assign",
        prefix: false,
        postfix: false,
        leftAssoc: true,
      },
    };
    //brackets
    var brackets = {
      "(": {
        type: "round",
        id: 1,
        is_open: true,
        is_close: false,
      },
      ")": {
        type: "round",
        id: 2,
        is_open: false,
        is_close: true,
      },
      "[": {
        type: "square",
        id: 3,
        is_open: true,
        is_close: false,
        maps_to: "vector",
      },
      "]": {
        type: "square",
        id: 4,
        is_open: false,
        is_close: true,
      },
      "{": {
        type: "curly",
        id: 5,
        is_open: true,
        is_close: false,
        maps_to: "Set",
      },
      "}": {
        type: "curly",
        id: 6,
        is_open: false,
        is_close: true,
      },
    };
    // Supported functions.
    // Format: function_name: [mapped_function, number_of_parameters]
    var functions = (this.functions = {
      cos: [trig.cos, 1],
      sin: [trig.sin, 1],
      tan: [trig.tan, 1],
      sec: [trig.sec, 1],
      csc: [trig.csc, 1],
      cot: [trig.cot, 1],
      acos: [trig.acos, 1],
      asin: [trig.asin, 1],
      atan: [trig.atan, 1],
      arccos: [trig.acos, 1],
      arcsin: [trig.asin, 1],
      arctan: [trig.atan, 1],
      asec: [trig.asec, 1],
      acsc: [trig.acsc, 1],
      acot: [trig.acot, 1],
      atan2: [trig.atan2, 2],
      acoth: [trigh.acoth, 1],
      asech: [trigh.asech, 1],
      acsch: [trigh.acsch, 1],
      sinh: [trigh.sinh, 1],
      cosh: [trigh.cosh, 1],
      tanh: [trigh.tanh, 1],
      asinh: [trigh.asinh, 1],
      sech: [trigh.sech, 1],
      csch: [trigh.csch, 1],
      coth: [trigh.coth, 1],
      acosh: [trigh.acosh, 1],
      atanh: [trigh.atanh, 1],
      log10: [, 1],
      exp: [exp, 1],
      radians: [radians, 1],
      degrees: [degrees, 1],
      min: [min, -1],
      max: [max, -1],
      erf: [, 1],
      floor: [, 1],
      ceil: [, 1],
      trunc: [, 1],
      Si: [, 1],
      step: [, 1],
      rect: [, 1],
      sinc: [sinc, 1],
      tri: [, 1],
      sign: [sign, 1],
      Ci: [, 1],
      Ei: [, 1],
      Shi: [, 1],
      Chi: [, 1],
      Li: [, 1],
      fib: [, 1],
      fact: [factorial, 1],
      factorial: [factorial, 1],
      continued_fraction: [continued_fraction, [1, 2]],
      dfactorial: [, 1],
      gamma_incomplete: [, [1, 2]],
      round: [round, [1, 2]],
      scientific: [scientific, [1, 2]],
      mod: [mod, 2],
      pfactor: [pfactor, 1],
      vector: [vector, -1],
      matrix: [matrix, -1],
      Set: [set, -1],
      imatrix: [imatrix, -1],
      parens: [parens, -1],
      sqrt: [sqrt, 1],
      cbrt: [cbrt, 1],
      nthroot: [nthroot, 2],
      log: [log, [1, 2]],
      expand: [expandall, 1],
      abs: [abs, 1],
      invert: [invert, 1],
      determinant: [determinant, 1],
      size: [size, 1],
      transpose: [transpose, 1],
      dot: [dot, 2],
      cross: [cross, 2],
      vecget: [vecget, 2],
      vecset: [vecset, 3],
      vectrim: [vectrim, [1, 2]],
      matget: [matget, 3],
      matset: [matset, 4],
      matgetrow: [matgetrow, 2],
      matsetrow: [matsetrow, 3],
      matgetcol: [matgetcol, 2],
      matsetcol: [matsetcol, 3],
      rationalize: [rationalize, 1],
      IF: [IF, 3],
      is_in: [is_in, 2],
      //imaginary support
      realpart: [realpart, 1],
      imagpart: [imagpart, 1],
      conjugate: [conjugate, 1],
      arg: [arg, 1],
      polarform: [polarform, 1],
      rectform: [rectform, 1],
      sort: [sort, [1, 2]],
      integer_part: [, 1],
      union: [union, 2],
      contains: [contains, 2],
      intersection: [intersection, 2],
      difference: [difference, 2],
      intersects: [intersects, 2],
      is_subset: [is_subset, 2],
      //system support
      print: [print, -1],
    });

    //error handler
    this.error = err;
    //this function is used to comb through the function modules and find a function given its name
    var findFunction = function (fname) {
      var fmodules = Settings.FUNCTION_MODULES,
        l = fmodules.length;
      for (var i = 0; i < l; i++) {
        var fmodule = fmodules[i];
        if (fname in fmodule) return fmodule[fname];
      }
      err("The function " + fname + " is undefined!");
    };

    /**
     * This method gives the ability to override operators with new methods.
     * @param {String} which
     * @param {Function} with_what
     */
    this.override = function (which, with_what) {
      if (!bin[which]) bin[which] = [];
      bin[which].push(this[which]);
      this[which] = with_what;
    };

    /**
     * Restores a previously overridden operator
     * @param {String} what
     */
    this.restore = function (what) {
      if (this[what]) this[what] = bin[what].pop();
    };

    /**
     * This method is supposed to behave similarly to the override method but it does not override
     * the existing function rather it only extends it
     * @param {String} what
     * @param {Function} with_what
     * @param {boolean} force_call
     */
    this.extend = function (what, with_what, force_call) {
      var _ = this,
        extended = this[what];
      if (typeof extended === "function" && typeof with_what === "function") {
        var f = this[what];
        this[what] = function (a, b) {
          if (isSymbol(a) && isSymbol(b) && !force_call) return f.call(_, a, b);
          else return with_what.call(_, a, b, f);
        };
      }
    };

    /**
     * Generates library's representation of a function. It's a fancy way of saying a symbol with
     * a few extras. The most important thing is that that it gives a fname and
     * an args property to the symbols in addition to changing its group to FN
     * @param {String} fn_name
     * @param {Array} params
     * @returns {Symbol}
     */
    this.symfunction = function (fn_name, params) {
      //call the proper function and return the result;
      var f = new Symbol(fn_name);
      f.group = FN;
      if (typeof params === "object") params = [].slice.call(params); //ensure an array
      f.args = params;
      f.fname = fn_name === PARENTHESIS ? "" : fn_name;
      f.updateHash();
      return f;
    };

    /**
     * An internal function call for the Parser. This will either trigger a real
     * function call if it can do so or just return a symbolic representation of the
     * function using symfunction.
     * @param {String} fn_name
     * @param {Array} args
     * @param {int} allowed_args
     * @returns {Symbol}
     */
    this.callfunction = function (fn_name, args, allowed_args) {
      var fn_settings = functions[fn_name];

      if (!fn_settings)
        err("Nerdamer currently does not support the function " + fn_name);

      var num_allowed_args = fn_settings[1] || allowed_args, //get the number of allowed arguments
        fn = fn_settings[0], //get the mapped function
        retval;
      //We want to be able to call apply on the arguments or create a symfunction. Both require
      //an array so make sure to wrap the argument in an array.
      if (!(args instanceof Array)) args = args !== undefined ? [args] : [];

      if (num_allowed_args !== -1) {
        var is_array = isArray(num_allowed_args),
          min_args = is_array ? num_allowed_args[0] : num_allowed_args,
          max_args = is_array ? num_allowed_args[1] : num_allowed_args,
          num_args = args.length;

        var error_msg =
          fn_name + " requires a {0} of {1} arguments. {2} provided!";

        if (num_args < min_args)
          err(format(error_msg, "minimum", min_args, num_args));
        if (num_args > max_args)
          err(format(error_msg, "maximum", max_args, num_args));
      }

      /*
       * The following are very important to the how nerdamer constructs functions!
       * Assumption 1 - if fn is undefined then handling of the function is purely numeric. This
       *     enables us to reuse Math, Math2, ..., any function from Settings.FUNCTIONS_MODULES entry
       * Assumption 2 - if fn is defined then that function takes care of EVERYTHING including symbolics
       * Assumption 3 - if the user calls symbolics on a function that returns a numeric value then
       *     they are expecting a symbolic output.
       */
      //check if arguments are all numers
      var numericArgs = allNumbers(args);
      //Big number support. Check if Big number is requested and the arguments are all numeric and, not imaginary
      //            if (Settings.USE_BIG && numericArgs) {
      //                retval = Big[fn_name].apply(undefined, args);
      //            }
      //            else {
      if (!fn) {
        // Call JS function
        //Remember assumption 1. No function defined so it MUST be numeric in nature
        fn = findFunction(fn_name);
        if (Settings.PARSE2NUMBER && numericArgs)
          retval = bigConvert(fn.apply(fn, args));
        else retval = _.symfunction(fn_name, args);
      } else {
        // Call nerdamer function
        //Remember assumption 2. The function is defined so it MUST handle all aspects including numeric values
        retval = fn.apply(fn_settings[2], args);
      }
      //            }

      return retval;
    };
    /**
     * Build a regex based on the operators currently loaded. These operators are to be ignored when
     * substituting spaces for multiplication
     */
    this.operator_filter_regex = (function () {
      //we only want the operators which are singular since those are the ones
      //that nerdamer uses anyway
      var ostr =
        "^\\" +
        Object.keys(operators)
          .filter(function (x) {
            if (x.length === 1) return x;
          })
          .join("\\");
      //create a regex which captures all spaces between characters except those
      //have an operator on one end
      return new RegExp("([" + ostr + "])\\s+([" + ostr + "])");
    })();

    /**
     * Replaces nerdamer.setOperator
     * @param {object} operator
     * @param {boolean} shift
     */
    this.setOperator = function (operator, action, shift) {
      var name = operator.operator; //take the name to be the symbol
      operators[name] = operator;
      if (action) this[operator.action] = action;
      //make the parser aware of the operator
      _[name] = operator.operation;
      //make the action available to the parser if infix
      if (!operator.action && !(operator.prefix || operator.postif)) {
        operator.action = name;
      }
      //if this operator is exclusive then all successive operators should be shifted
      if (shift === "over" || shift === "under") {
        var precedence = operator.precedence;

        for (var x in operators) {
          var o = operators[x];
          var condition =
            shift === "over"
              ? o.precedence >= precedence
              : o.precedence > precedence;
          if (condition) o.precedence++;
        }
      }
    };

    /**
     * Gets an opererator by its symbol
     * @param {String} operator
     * @returns {Object}
     */
    this.getOperator = function (operator) {
      return operators[operator];
    };

    this.aliasOperator = function (o, n) {
      var t = {};
      var operator = operators[o];
      //copy everything over to the new operator
      for (var x in operator) {
        t[x] = operator[x];
      }
      //update the symbol
      t.operator = n;

      this.setOperator(t);
    };

    /**
     * Returns the list of operators. Caution! Can break parser!
     * @returns {object}
     */
    this.getOperators = function () {
      //will replace this with some cloning action in the future
      return operators;
    };

    this.getBrackets = function () {
      return brackets;
    };
    /*
     * Preforms preprocessing on the string. Useful for making early modification before
     * sending to the parser
     * @param {String} e
     */
    var prepare_expression = function (e) {
      /*
       * Since variables cannot start with a number, the assumption is made that when this occurs the
       * user intents for this to be a coefficient. The multiplication symbol in then added. The same goes for
       * a side-by-side close and open parenthesis
       */
      e = String(e);
      //apply preprocessors
      for (var i = 0; i < preprocessors.actions.length; i++)
        e = preprocessors.actions[i].call(this, e);

      //e = e.split(' ').join('');//strip empty spaces
      //replace multiple spaces with one space
      e = e.replace(/\s+/g, " ");

      //only even bother to check if the string contains e. This regex is painfully slow and might need a better solution. e.g. hangs on (0.06/3650))^(365)
      if (/e/gi.test(e)) {
        // negative numbers
        e = e.replace(/\-+\d+\.?\d*e\+?\-?\d+/gi, function (x) {
          return scientificToDecimal(x);
        });
        // positive numbers that are not part of an identifier
        e = e.replace(/(?<![A-Za-z])\d+\.?\d*e\+?\-?\d+/gi, function (x) {
          return scientificToDecimal(x);
        });
      }
      //replace scientific numbers

      //allow omission of multiplication after coefficients
      e =
        e
          .replace(Settings.IMPLIED_MULTIPLICATION_REGEX, function () {
            var str = arguments[4],
              group1 = arguments[1],
              group2 = arguments[2],
              start = arguments[3],
              first = str.charAt(start),
              before = "",
              d = "*";
            if (!first.match(/[\+\-\/\*]/)) before = str.charAt(start - 1);
            if (before.match(/[a-z]/i)) d = "";
            return group1 + d + group2;
          })
          .replace(/([a-z0-9_]+)/gi, function (match, a) {
            if (
              Settings.USE_MULTICHARACTER_VARS === false &&
              !(a in functions)
            ) {
              if (!isNaN(a)) return a;
              return a.split("").join("*");
            }
            return a;
          })
          //allow omission of multiplication sign between brackets
          .replace(/\)\(/g, ")*(") || "0";
      //replace x(x+a) with x*(x+a)
      while (true) {
        var e_org = e; //store the original
        e = e.replace(
          /([a-z0-9_]+)(\()|(\))([a-z0-9]+)/gi,
          function (match, a, b, c, d) {
            var g1 = a || c,
              g2 = b || d;
            if (g1 in functions)
              //create a passthrough for functions
              return g1 + g2;
            return g1 + "*" + g2;
          },
        );
        //if the original equals the replace we're done
        if (e_org === e) break;
      }
      return e;
    };
    //delay setting of constants until Settings is ready
    this.initConstants = function () {
      this.CONSTANTS = {
        E: new Symbol(Settings.E),
        PI: new Symbol(Settings.PI),
      };
    };
    /*
     * Debugging method used to better visualize vector and arrays
     * @param {object} o
     * @returns {String}
     */
    this.pretty_print = function (o) {
      if (Array.isArray(o)) {
        var s = o.map((x) => _.pretty_print(x)).join(", ");
        if (o.type === "vector") return "vector<" + s + ">";
        return "(" + s + ")";
      }
      return o.toString();
    };
    this.peekers = {
      pre_operator: [],
      post_operator: [],
      pre_function: [],
      post_function: [],
    };

    this.callPeekers = function (name) {
      if (Settings.callPeekers) {
        var peekers = this.peekers[name];
        //remove the first items and stringify
        var args = arguments2Array(arguments).slice(1).map(stringify);
        //call each one of the peekers
        for (var i = 0; i < peekers.length; i++) {
          peekers[i].apply(null, args);
        }
      }
    };
    /*
     * Tokenizes the string
     * @param {String} e
     * @returns {Token[]}
     */
    this.tokenize = function (e) {
      //cast to String
      e = String(e);
      //remove multiple white spaces and spaces at beginning and end of string
      e = e.trim().replace(/\s+/g, " ");
      //remove spaces before and after brackets
      for (var x in brackets) {
        var regex = new RegExp(
          brackets[x].is_close ? "\\s+\\" + x : "\\" + x + "\\s+",
          "g",
        );
        e = e.replace(regex, x);
      }

      var col = 0; //the column position
      var L = e.length; //expression length
      var lpos = 0; //marks beginning of next token
      var tokens = []; //the tokens container
      var scopes = [tokens]; //initiate with the tokens as the highest scope
      var target = scopes[0]; //the target to which the tokens are added. This can swing up or down
      var depth = 0;
      var open_brackets = [];
      var has_space = false; //marks if an open space character was found
      var SPACE = " ";
      var EMPTY_STRING = "";
      var COMMA = ",";
      var MINUS = "-";
      var MULT = "*";
      //Possible source of bug. Review
      /*
             //gets the next space
             var next_space = function(from) {
             for(var i=from; i<L; i++) {
             if(e.charAt(i) === ' ')
             return i;
             }
             
             return L; //assume the end of the string instead
             };
             */
      /**
       * Adds a scope to tokens
       * @param {String} scope_type
       * @param {int} column
       * @returns {undefined}
       */
      var addScope = function (scope_type, column) {
        var new_scope = []; //create a new scope
        if (scope_type !== undefined) {
          new_scope.type = scope_type;
        }
        new_scope.column = column; //mark the column of the scope
        scopes.push(new_scope); //add it to the list of scopes
        target.push(new_scope); //add it to the tokens list since now it's a scope
        target = new_scope; //point to it
        depth++; //go down one in scope
      };
      /**
       * Goes up in scope by one
       * @returns {undefined}
       */
      var goUp = function () {
        scopes.pop(); //remove the scope from the scopes stack
        target = scopes[--depth]; //point the above scope
      };
      /**
       * Extracts all the operators from the expression string starting at postion start_at
       * @param {int} start_at
       * @returns {String}
       */
      var get_operator_str = function (start_at) {
        start_at = start_at !== undefined ? start_at : col;
        //mark the end of the operator as the start since we're just going
        //to be walking along the string
        var end = start_at + 1;
        //just keep moving along
        while (e.charAt(end++) in operators) {}
        //remember that we started at one position ahead. The beginning operator is what triggered
        //this function to be called in the first place. String.CharAt is zero based so we now
        //have to correct two places. The initial increment + the extra++ at the end of end during
        //the last iteration.
        return e.substring(start_at, end - 1);
      };
      /**
       * Breaks operator up in to several different operators as defined in operators
       * @param {String} operator_str
       * @returns {String[]}
       */
      var chunkify = function (operator_str) {
        var start = col - operator_str.length; //start of operator
        var _operators = [];
        var operator = operator_str.charAt(0);
        //grab the largest possible chunks but start at 2 since we already know
        //that the first character is an operator

        for (var i = 1, L = operator_str.length; i < L; i++) {
          var ch = operator_str.charAt(i);
          var o = operator + ch;
          //since the operator now is undefined then the last operator
          //was the largest possible combination.
          if (!(o in operators)) {
            _operators.push(new Token(operator, Token.OPERATOR, start + i));
            operator = ch;
          } else operator = o; //now the operator is the larger chunk
        }
        //add the last operator
        _operators.push(new Token(operator, Token.OPERATOR, start + i));
        return _operators;
      };

      /**
       * Is used to add a token to the tokens array. Makes sure that no empty token is added
       * @param {int} at
       * @param {String} token
       * @returns {undefined}
       */
      var add_token = function (at, token) {
        //grab the token if we're not supplied one
        if (token === undefined) token = e.substring(lpos, at);
        //only add it if it's not an empty string
        if (token in _.units) target.push(new Token(token, Token.UNIT, lpos));
        else if (token !== "")
          target.push(new Token(token, Token.VARIABLE_OR_LITERAL, lpos));
      };
      /**
       * Adds a function to the output
       * @param {String} f
       * @returns {undefined}
       */
      var add_function = function (f) {
        target.push(new Token(f, Token.FUNCTION, lpos));
      };
      /**
       * Tokens are found between operators so this marks the location of where the last token was found
       * @param {int} position
       * @returns {undefined}
       */
      var set_last_position = function (position) {
        lpos = position + 1;
      };
      /**
       * When a operator is found and added, especially a combo operator, then the column location
       * has to be adjusted to the end of the operator
       * @returns {undefined}
       */
      var adjust_column_position = function () {
        lpos = lpos + operator_str.length - 2;
        col = lpos - 1;
      };
      for (; col < L; col++) {
        var ch = e.charAt(col);
        if (ch in operators) {
          add_token(col);
          //is the last token numeric?
          var last_token_is_numeric = target[0] && isNumber(target[0]);
          //is this character multiplication?
          var is_multiplication = last_token_is_numeric && ch === MULT;
          //if we're in a new scope then go up by one but if the space
          //is right befor an operator then it makes no sense to go up in scope
          //consider sin -x. The last position = current position at the minus sign
          //this means that we're going for sin(x) -x which is wrong
          //Ignore comma since comma is still part of the existing scope.
          if (has_space && lpos < col && !(ch === COMMA || is_multiplication)) {
            has_space = false;
            goUp();
          }
          //mark the last position that a
          set_last_position(col + 1);
          var operator_str = get_operator_str(col);

          adjust_column_position();
          target.push.apply(target, chunkify(operator_str));
        } else if (ch in brackets) {
          var bracket = brackets[ch];

          if (bracket.is_open) {
            //mark the bracket
            open_brackets.push([bracket, lpos]);
            var f = e.substring(lpos, col);
            if (f in functions) {
              add_function(f);
            } else if (f !== "") {
              //assume multiplication
              //TODO: Add the multiplication to stack
              target.push(new Token(f, Token.VARIABLE_OR_LITERAL, lpos));
            }
            //go down one in scope
            addScope(bracket.maps_to, col);
          } else if (bracket.is_close) {
            //get the matching bracket
            var pair = open_brackets.pop();
            //throw errors accordingly
            //missing open bracket
            if (!pair)
              throw new ParityError(
                "Missing open bracket for bracket at: " + (col + 1),
              );
            //incorrect pair
            else if (pair[0].id !== bracket.id - 1)
              throw new ParityError("Parity error");

            add_token(col);
            goUp();
          }
          set_last_position(col);
        } else if (ch === SPACE) {
          var prev = e.substring(lpos, col); //look back
          var nxt = e.charAt(col + 1); //look forward
          if (has_space) {
            if (prev in operators) {
              target.push(new Token(prev, Token.OPERATOR, col));
            } else {
              add_token(undefined, prev);
              //we're at the closing space
              goUp(); //go up in scope if we're at a space

              //assume multiplication if it's not an operator except for minus
              var is_operator = nxt in operators;

              if (
                (is_operator && operators[nxt].value === MINUS) ||
                !is_operator
              ) {
                target.push(new Token(MULT, Token.OPERATOR, col));
              }
            }
            has_space = false; //remove the space
          } else {
            //we're at the closing space
            //check if it's a function
            var f = e.substring(lpos, col);

            if (f in functions) {
              //there's no need to go up in scope if the next character is an operator
              has_space = true; //mark that a space was found
              add_function(f);
              addScope();
            } else if (f in operators) {
              target.push(new Token(f, Token.OPERATOR, col));
            } else {
              add_token(undefined, f);
              //peek ahead to the next character
              var nxt = e.charAt(col + 1);

              //If it's a number then add the multiplication operator to the stack but make sure that the next character
              //is not an operator

              if (
                prev !== EMPTY_STRING &&
                nxt !== EMPTY_STRING &&
                !(prev in operators) &&
                !(nxt in operators)
              )
                target.push(new Token(MULT, Token.OPERATOR, col));
            }
            //Possible source of bug. Review
            /*
                         //space can mean multiplication so add the symbol if the is encountered
                         if(/\d+|\d+\.?\d*e[\+\-]*\d+/i.test(f)) {
                         var next = e.charAt(col+1);
                         var next_is_operator = next in operators;
                         var ns = next_space(col+1);
                         var next_word = e.substring(col+1, ns);
                         //the next can either be a prefix operator or no operator
                         if((next_is_operator && operators[next].prefix) || !(next_is_operator || next_word in operators))
                         target.push(new Token('*', Token.OPERATOR, col));
                         }
                         */
          }
          set_last_position(col); //mark this location
        }
      }
      //check that all brackets were closed
      if (open_brackets.length) {
        var b = open_brackets.pop();
        throw new ParityError(
          "Missing closed bracket for bracket at " + (b[1] + 1),
        );
      }
      //add the last token
      add_token(col);

      return tokens;
    };
    /*
     * Puts token array in Reverse Polish Notation
     * @param {Token[]} tokens
     * @returns {Token[]}
     */
    this.toRPN = function (tokens) {
      var fn = tokens.type;
      var l = tokens.length,
        i;
      var output = [];
      var stack = [];
      var prefixes = [];
      var collapse = function (target, destination) {
        while (target.length) destination.push(target.pop());
      };
      //mark all the prefixes and add them to the stack
      for (i = 0; i < l; i++) {
        var token = tokens[i];
        if (token.type !== Token.OPERATOR) break;
        if (!token.prefix) throw new OperatorError("Not a prefix operator");
        token.is_prefix = true;
        stack.push(token);
      }
      //begin with remaining tokens
      for (; i < l; i++) {
        var e = tokens[i];
        if (e.type === Token.OPERATOR) {
          var operator = e;

          //create the option for the operator being overloaded
          if (operator.overloaded) {
            var next = tokens[i + 1];
            //if it's followed by a number or variable then we assume it's not a postfix operator
            if (next && next.type === Token.VARIABLE_OR_LITERAL) {
              operator.postfix = false;
              //override the original function with the overload function
              operator.action = operator.overloadAction;
              operator.leftAssoc = operator.overloadLeftAssoc;
            }
          }

          //if the stack is not empty
          while (stack.length) {
            var last = stack[stack.length - 1];
            //if (there is an operator at the top of the operator stack with greater precedence)
            //or (the operator at the top of the operator stack has equal precedence and is left associative)) ~ wikipedia
            //the !prefixes.length makes sure that the operator on stack isn't prematurely taken fromt he stack.
            if (
              !(
                last.precedence > operator.precedence ||
                (!operator.leftAssoc && last.precedence === operator.precedence)
              )
            )
              break;
            output.push(stack.pop());
          }

          //change the behavior of the operator if it's a vector and we've been asked to do so
          if ((fn === "vector" || fn === "set") && "vectorFn" in operator)
            operator.action = operator.vectorFn;

          //if the operator is a postfix operator then we're ready to go since it belongs
          //to the preceding token. However the output cannot be empty. It must have either
          //an operator or a variable/literal
          if (operator.postfix) {
            var previous = tokens[i - 1];
            if (!previous)
              throw new OperatorError(
                "Unexpected prefix operator '" + e.value + "'! at " + e.column,
              );
            else if (previous.type === Token.OPERATOR) {
              //a postfix can only be followed by a postfix
              if (!previous.postfix)
                throw new OperatorError(
                  "Unexpected prefix operator '" +
                    previous.value +
                    "'! at " +
                    previous.column,
                );
            }
          } else {
            //we must be at an infix so point the operator this
            do {
              //the first one is an infix operator all others have to be prefix operators so jump to the end
              var next = tokens[i + 1]; //take a look ahead
              var next_is_operator = next
                ? next.type === Token.OPERATOR
                : false; //check if it's an operator
              if (next_is_operator) {
                //if it's not a prefix operator then it not in the right place
                if (!next.prefix) {
                  throw new OperatorError(
                    "A prefix operator was expected at " + next.column,
                  );
                }
                //mark it as a confirmed prefix
                next.is_prefix = true;
                //add it to the prefixes
                prefixes.push(next);
                i++;
              }
            } while (next_is_operator);
          }

          //if it's a prefix it should be on a special stack called prefixes
          //we do this to hold on to prefixes because of left associative operators.
          //they belong to the variable/literal but if placed on either the stack
          //or output there's no way of knowing this. I might be wrong so I welcome
          //any discussion about this.

          if (operator.is_prefix)
            //ADD ALL EXCEPTIONS FOR ADDING TO PREFIX STACK HERE. !!!
            prefixes.push(operator);
          else stack.push(operator);
          //move the prefixes to the stack
          while (prefixes.length) {
            if (
              operator.leftAssoc ||
              (!operator.leftAssoc &&
                prefixes[prefixes.length - 1].precedence >= operator.precedence)
            )
              //revisit for commas
              stack.push(prefixes.pop());
            else break;
          }
        } else if (e.type === Token.VARIABLE_OR_LITERAL) {
          //move prefixes to stack at beginning of scope
          if (output.length === 0) collapse(prefixes, stack);
          //done with token
          output.push(e);
          var last_on_stack = stack[stack.length - 1];
          //then move all the prefixes to the output
          if (!last_on_stack || !last_on_stack.leftAssoc)
            collapse(prefixes, output);
        } else if (e.type === Token.FUNCTION) {
          stack.push(e);
        } else if (e.type === Token.UNIT) {
          //if it's a unit it belongs on the stack since it's tied to the previous token
          output.push(e);
        }
        //if it's an additonal scope then put that into RPN form
        if (Array.isArray(e)) {
          output.push(this.toRPN(e));
          if (e.type) output.push(new Token(e.type, Token.FUNCTION, e.column)); //since it's hidden it needs no column
        }
      }
      //collapse the remainder of the stack and prefixes to output
      collapse(stack, output);
      collapse(prefixes, output);

      return output;
    };
    /*
     * Parses the tokens
     * @param {Tokens[]} rpn
     * @param {object} substitutions
     * @returns {Symbol}
     */
    this.parseRPN = function (rpn, substitutions) {
      try {
        //default substitutions
        substitutions = substitutions || {};
        //prepare the substitutions.
        //we first parse them out as-is
        for (var x in substitutions)
          substitutions[x] = _.parse(substitutions[x], {});

        //Although technically constants,
        //pi and e are only available when evaluating the expression so add to the subs.
        //Doing this avoids rounding errors
        //link e and pi
        if (Settings.PARSE2NUMBER) {
          //use the value provided if the individual for some strange reason prefers this.
          //one reason could be to sub e but not pi or vice versa
          if (!("e" in substitutions)) substitutions.e = new Symbol(Settings.E);
          if (!("pi" in substitutions))
            substitutions.pi = new Symbol(Settings.PI);
        }

        var Q = [];
        for (var i = 0, l = rpn.length; i < l; i++) {
          var e = rpn[i];

          //Arrays indicate a new scope so parse that out
          if (Array.isArray(e)) {
            e = this.parseRPN(e, substitutions);
          }

          if (e) {
            if (e.type === Token.OPERATOR) {
              if (e.is_prefix || e.postfix)
                //resolve the operation assocated with the prefix
                Q.push(e.operation(Q.pop()));
              else {
                var b = Q.pop();
                var a = Q.pop();
                //Throw an error if the RH value is empty. This cannot be a postfix since we already checked
                if (typeof a === "undefined")
                  throw new OperatorError(
                    e + " is not a valid postfix operator at " + e.column,
                  );

                var is_comma = e.action === "comma";
                //convert Sets to Vectors on all operations at this point. Sets are only recognized functions or individually
                if (a instanceof Set && !is_comma) a = Vector.fromSet(a);

                if (b instanceof Set && !is_comma) b = Vector.fromSet(b);

                //call all the pre-operators
                this.callPeekers("pre_operator", a, b, e);

                var ans = _[e.action](a, b);

                //call all the pre-operators
                this.callPeekers("post_operator", ans, a, b, e);

                Q.push(ans);
              }
            } else if (e.type === Token.FUNCTION) {
              var args = Q.pop();
              var parent = args.parent; //make a note of the parent
              if (!(args instanceof Collection)) args = Collection.create(args);
              //the return value may be a vector. If it is then we check
              //Q to see if there's another vector on the stack. If it is then
              //we check if has elements. If it does then we know that we're dealing
              //with an "getter" object and return the requested values

              //call the function. This is the _.callfunction method in nerdamer
              var fn_name = e.value;
              var fn_args = args.getItems();

              //call the pre-function peekers
              this.callPeekers("pre_function", fn_name, fn_args);

              var ret = _.callfunction(fn_name, fn_args);

              //call the post-function peekers
              this.callPeekers("post_function", ret, fn_name, fn_args);

              var last = Q[Q.length - 1];
              var next = rpn[i + 1];
              var next_is_comma =
                next && next.type === Token.OPERATOR && next.value === ",";

              // if(!next_is_comma && ret instanceof Vector && last && last.elements && !(last instanceof Collection)) {
              //     //remove the item from the queue
              //     var item = Q.pop();

              //     var getter = ret.elements[0];
              //     //check if it's symbolic. If so put it back and add the item to the stack
              //     if(!getter.isConstant()) {
              //         item.getter = getter;
              //         Q.push(item);
              //         Q.push(ret);
              //     }
              //     else if(getter instanceof Slice) {
              //         //if it's a Slice return the slice
              //         Q.push(Vector.fromArray(item.elements.slice(getter.start, getter.end)));
              //     }
              //     else {
              //         var index = Number(getter);
              //         var il = item.elements.length;
              //         //support for negative indices
              //         if(index < 0)
              //             index = il + index;
              //         //it it's still out of bounds
              //         if(index < 0 || index >= il) //index should no longer be negative since it's been reset above
              //             //range error
              //             throw new OutOfRangeError('Index out of range ' + (e.column + 1));

              //         var element = item.elements[index];
              //         //cyclic but we need to mark this for future reference
              //         item.getter = index;
              //         element.parent = item;

              //         Q.push(element);
              //     }
              // }
              // else {
              //extend the parent reference
              if (parent) ret.parent = parent;
              Q.push(ret);
              // }
            } else {
              var subbed;
              var v = e.value;

              if (v in Settings.ALIASES) e = _.parse(Settings.ALIASES[e]);
              //wrap it in a symbol if need be
              else if (e.type === Token.VARIABLE_OR_LITERAL) e = new Symbol(v);
              else if (e.type === Token.UNIT) {
                e = new Symbol(v);
                e.isUnit = true;
              }

              //make substitutions
              //Always constants first. This avoids the being overridden
              if (v in _.CONSTANTS) {
                subbed = e;
                e = new Symbol(_.CONSTANTS[v]);
              }
              //next substitutions. This allows declared variable to be overridden
              //check if the values match to avoid erasing the multiplier.
              //Example:/e = 3*a. substutiting a for a will wipe out the multiplier.
              else if (
                v in substitutions &&
                v !== substitutions[v].toString()
              ) {
                subbed = e;
                e = substitutions[v].clone();
              }
              //next declare variables
              else if (v in VARS) {
                subbed = e;
                e = VARS[v].clone();
              }
              //make notation of what it was before
              if (subbed) e.subbed = subbed;

              Q.push(e);
            }
          }
        }

        var retval = Q[0];

        if (["undefined", "string", "number"].indexOf(typeof retval) !== -1) {
          throw new UnexpectedTokenError("Unexpected token!");
        }

        return retval;
      } catch (error) {
        if (error.message === "timeout") throw error;
        var rethrowErrors = [OutOfFunctionDomainError];
        // Rethrow certain errors in the same class to preserve them
        rethrowErrors.forEach(function (E) {
          if (error instanceof E) {
            throw new E(error.message + ": " + e.column);
          }
        });

        throw new ParseError(error.message + ": " + e.column);
      }
    };
    /**
     * This is the method that triggers the parsing of the string. It generates a parse tree but processes
     * it right away. The operator functions are called when their respective operators are reached. For instance
     * + with cause this.add to be called with the left and right hand values. It works by walking along each
     * character of the string and placing the operators on the stack and values on the output. When an operator
     * having a lower order than the last is reached then the stack is processed from the last operator on the
     * stack.
     * @param {String} token
     */

    function Node(token) {
      this.type = token.type;
      this.value = token.value;
      //the incoming token may already be a Node type
      this.left = token.left;
      this.right = token.right;
    }

    Node.prototype.toString = function () {
      var left = this.left ? this.left.toString() + "---" : "";
      var right = this.right ? "---" + this.right.toString() : "";
      return left + "(" + this.value + ")" + right;
    };

    Node.prototype.toHTML = function (depth, indent) {
      depth = depth || 0;
      indent = typeof indent === "undefined" ? 4 : indent;
      var tab = function (n) {
        return " ".repeat(indent * n);
      };
      var html = "";
      var left = this.left
        ? tab(depth + 1) +
          "<li>\n" +
          this.left.toHTML(depth + 2, indent) +
          tab(depth + 1) +
          "</li> \n"
        : "";
      var right = this.right
        ? tab(depth + 1) +
          "<li>\n" +
          this.right.toHTML(depth + 2, indent) +
          tab(depth + 1) +
          "</li>\n"
        : "";
      var html =
        tab(depth) +
        '<div class="' +
        this.type.toLowerCase() +
        '"><span>' +
        this.value +
        "</span></div>" +
        tab(depth) +
        "\n";
      if (left || right) {
        html += tab(depth) + "<ul>\n" + left + right + tab(depth) + "</ul>\n";
      }
      html += "";
      return html;
    };

    this.tree = function (tokens) {
      var Q = [];
      for (var i = 0; i < tokens.length; i++) {
        var e = tokens[i];
        //Arrays indicate a new scope so parse that out
        if (Array.isArray(e)) {
          e = this.tree(e);
          //if it's a comma then it's just arguments
          Q.push(e);
          continue;
        }
        if (e.type === Token.OPERATOR) {
          if (e.is_prefix || e.postfix) {
            //prefixes go to the left, postfix to the right
            var location = e.is_prefix ? "left" : "right";
            var last = Q.pop();
            e = new Node(e);
            e[location] = last;
            Q.push(e);
          } else {
            e = new Node(e);
            e.right = Q.pop();
            e.left = Q.pop();
            Q.push(e);
          }
        } else if (e.type === Token.FUNCTION) {
          e = new Node(e);
          var args = Q.pop();
          e.right = args;
          if (e.value === "object") {
            //check if Q has a value
            var last = Q[Q.length - 1];
            if (last) {
              while (last.right) {
                last = last.right;
              }
              last.right = e;
              continue;
            }
          }

          Q.push(e);
        } else {
          Q.push(new Node(e));
        }
      }

      return Q[0];
    };
    this.parse = function (e, substitutions) {
      e = prepare_expression(e);
      substitutions = substitutions || {};
      //three passes but easier to debug
      var tokens = this.tokenize(e);
      var rpn = this.toRPN(tokens);
      return this.parseRPN(rpn, substitutions);
    };
    /**
     * TODO: Switch to Parser.tokenize for this method
     * Reads a string into an array of Symbols and operators
     * @param {String} expression_string
     * @returns {Array}
     */
    this.toObject = function (expression_string) {
      var objectify = function (tokens) {
        var output = [];
        for (var i = 0, l = tokens.length; i < l; i++) {
          var token = tokens[i];
          var v = token.value;
          if (token.type === Token.VARIABLE_OR_LITERAL) {
            output.push(new Symbol(v));
          } else if (token.type === Token.FUNCTION) {
            //jump ahead since the next object are the arguments
            i++;
            //create a symbolic function and stick it on output
            var f = _.symfunction(v, objectify(tokens[i]));
            f.isConversion = true;
            output.push(f);
          } else if (token.type === Token.OPERATOR) {
            output.push(v);
          } else {
            output.push(objectify(token));
          }
        }

        return output;
      };
      return objectify(_.tokenize(expression_string));
    };

    // A helper method for toTeX
    var chunkAtCommas = function (arr) {
      var j,
        k = 0,
        chunks = [[]];
      for (var j = 0, l = arr.length; j < l; j++) {
        if (arr[j] === ",") {
          k++;
          chunks[k] = [];
        } else {
          chunks[k].push(arr[j]);
        }
      }
      return chunks;
    };

    // Helper method for toTeX
    var rem_brackets = function (str) {
      return str.replace(/^\\left\((.+)\\right\)$/g, function (str, a) {
        if (a) return a;
        return str;
      });
    };

    var remove_redundant_powers = function (arr) {
      // The filtered array
      var narr = [];

      while (arr.length) {
        // Remove the element from the front
        var e = arr.shift();
        var next = arr[0];
        var next_is_array = isArray(next);
        var next_is_minus = next === "-";

        // Remove redundant plusses
        if (e === "^") {
          if (next === "+") {
            arr.shift();
          } else if (next_is_array && next[0] === "+") {
            next.shift();
          }

          // Remove redundant parentheses
          if (next_is_array && next.length === 1) {
            arr.unshift(arr.shift()[0]);
          }
        }

        // Check if it's a negative power
        if (
          e === "^" &&
          ((next_is_array && next[0] === "-") || next_is_minus)
        ) {
          // If so:
          // - Remove it from the new array, place a one and a division sign in that array and put it back
          var last = narr.pop();
          // Check if it's something multiplied by
          var before = narr[narr.length - 1];
          var before_last = "1";

          if (before === "*") {
            narr.pop();
            // For simplicity we just pop it.
            before_last = narr.pop();
          }
          // Implied multiplication
          else if (isArray(before)) {
            before_last = narr.pop();
          }

          narr.push(before_last, "/", last, e);

          // Remove the negative sign from the power
          if (next_is_array) {
            next.shift();
          } else {
            arr.shift();
          }

          // Remove it from the array so we don't end up with redundant parentheses if we can
          if (next_is_array && next.length === 1) {
            narr.push(arr.shift()[0]);
          }
        } else {
          narr.push(e);
        }
      }

      return narr;
    };
    /*
     * Convert expression or object to LaTeX
     * @param {String} expression_or_obj
     * @param {object} opt
     * @returns {String}
     */
    this.toTeX = function (expression_or_obj, opt) {
      opt = opt || {};
      // Add decimal option as per issue #579. Consider passing an object to Latex.latex as option instead of string
      var decimals = opt.decimals === true ? "decimals" : undefined;

      var obj =
          typeof expression_or_obj === "string"
            ? this.toObject(expression_or_obj)
            : expression_or_obj,
        TeX = [],
        cdot = typeof opt.cdot === "undefined" ? "\\cdot" : opt.cdot; //set omit cdot to true by default

      // Remove negative powers as per issue #570
      obj = remove_redundant_powers(obj);

      if (isArray(obj)) {
        var nobj = [],
          a,
          b;
        //first handle ^
        for (var i = 0; i < obj.length; i++) {
          a = obj[i];

          if (obj[i + 1] === "^") {
            b = obj[i + 2];
            nobj.push(
              LaTeX.braces(this.toTeX([a])) +
                "^" +
                LaTeX.braces(this.toTeX([b])),
            );
            i += 2;
          } else {
            nobj.push(a);
          }
        }
        obj = nobj;
      }

      for (var i = 0, l = obj.length; i < l; i++) {
        var e = obj[i];

        // Convert * to cdot
        if (e === "*") {
          e = cdot;
        }

        if (isSymbol(e)) {
          if (e.group === FN) {
            var fname = e.fname,
              f;

            if (fname === SQRT) {
              f = "\\sqrt" + LaTeX.braces(this.toTeX(e.args));
            } else if (fname === ABS) {
              f = LaTeX.brackets(this.toTeX(e.args), "abs");
            } else if (fname === PARENTHESIS) {
              f = LaTeX.brackets(this.toTeX(e.args), "parens");
            } else if (fname === Settings.LOG10) {
              f =
                "\\" +
                Settings.LOG10_LATEX +
                "\\left( " +
                this.toTeX(e.args) +
                "\\right)";
            } else if (fname === "integrate") {
              /* Retrive [Expression, x] */
              var chunks = chunkAtCommas(e.args);
              /* Build TeX */
              var expr = LaTeX.braces(this.toTeX(chunks[0])),
                dx = this.toTeX(chunks[1]);
              f = "\\int " + expr + "\\, d" + dx;
            } else if (fname === "defint") {
              var chunks = chunkAtCommas(e.args),
                expr = LaTeX.braces(this.toTeX(chunks[0])),
                dx = this.toTeX(chunks[3]),
                lb = this.toTeX(chunks[1]),
                ub = this.toTeX(chunks[2]);
              f =
                "\\int\\limits_{" +
                lb +
                "}^{" +
                ub +
                "} " +
                expr +
                "\\, d" +
                dx;
            } else if (fname === "diff") {
              var chunks = chunkAtCommas(e.args);
              var dx = "",
                expr = LaTeX.braces(this.toTeX(chunks[0]));
              /* Handle cases: one argument provided, we need to guess the variable, and assume n = 1 */
              if (chunks.length === 1) {
                var vars = [];
                for (j = 0; j < chunks[0].length; j++) {
                  if (chunks[0][j].group === 3) {
                    vars.push(chunks[0][j].value);
                  }
                }
                vars.sort();
                dx =
                  vars.length > 0
                    ? "\\frac{d}{d " + vars[0] + "}"
                    : "\\frac{d}{d x}";
              } else if (chunks.length === 2) {
              /* If two arguments, we have expression and variable, we assume n = 1 */
                dx = "\\frac{d}{d " + chunks[1] + "}";
              } else {
              /* If we have more than 2 arguments, we assume we've got everything */
                dx =
                  "\\frac{d^{" +
                  chunks[2] +
                  "}}{d " +
                  this.toTeX(chunks[1]) +
                  "^{" +
                  chunks[2] +
                  "}}";
              }

              f = dx + "\\left(" + expr + "\\right)";
            } else if (fname === "sum" || fname === "product") {
              // Split e.args into 4 parts based on locations of , symbols.
              var argSplit = [[], [], [], []],
                j = 0,
                i;
              for (i = 0; i < e.args.length; i++) {
                if (e.args[i] === ",") {
                  j++;
                  continue;
                }
                argSplit[j].push(e.args[i]);
              }
              // Then build TeX string.
              f =
                (fname === "sum" ? "\\sum_" : "\\prod_") +
                LaTeX.braces(
                  this.toTeX(argSplit[1]) + " = " + this.toTeX(argSplit[2]),
                );
              f +=
                "^" +
                LaTeX.braces(this.toTeX(argSplit[3])) +
                LaTeX.braces(this.toTeX(argSplit[0]));
            } else if (fname === "limit") {
              var args = chunkAtCommas(e.args).map(function (x) {
                if (Array.isArray(x)) return _.toTeX(x.join(""));
                return _.toTeX(String(x));
              });
              f =
                "\\lim_" +
                LaTeX.braces(args[1] + "\\to " + args[2]) +
                " " +
                LaTeX.braces(args[0]);
            } else if (fname === FACTORIAL || fname === DOUBLEFACTORIAL) {
              f = this.toTeX(e.args) + (fname === FACTORIAL ? "!" : "!!");
            } else {
              f = LaTeX.latex(e, decimals);
              //f = '\\mathrm'+LaTeX.braces(fname.replace(/_/g, '\\_')) + LaTeX.brackets(this.toTeX(e.args), 'parens');
            }

            TeX.push(f);
          } else {
            TeX.push(LaTeX.latex(e, decimals));
          }
        } else if (isArray(e)) {
          TeX.push(LaTeX.brackets(this.toTeX(e)));
        } else {
          if (e === "/")
            TeX.push(
              LaTeX.frac(
                rem_brackets(TeX.pop()),
                rem_brackets(this.toTeX([obj[++i]])),
              ),
            );
          else TeX.push(e);
        }
      }

      return TeX.join(" ");
    };

    //Parser.functions ==============================================================
    /* Although parens is not a "real" function it is important in some cases when the
     * symbol must carry parenthesis. Once set you don't have to worry about it anymore
     * as the parser will get rid of it at the first opportunity
     */
    function parens(symbol) {
      if (Settings.PARSE2NUMBER) {
        return symbol;
      }
      return _.symfunction("parens", [symbol]);
    }

    function abs(symbol) {
      //|-∞| = ∞
      if (symbol.isInfinity) {
        return Symbol.infinity();
      }
      if (symbol.multiplier.lessThan(0)) symbol.multiplier.negate();

      if (symbol.isImaginary()) {
        var re = symbol.realpart();
        var im = symbol.imagpart();
        if (re.isConstant() && im.isConstant())
          return sqrt(
            _.add(_.pow(re, new Symbol(2)), _.pow(im, new Symbol(2))),
          );
      } else if (isNumericSymbol(symbol) || even(symbol.power)) {
        return symbol;
      }
      // together.math baseunits are presumed positive
      else if (
        isVariableSymbol(symbol) &&
        typeof symbol.value === "string" &&
        symbol.value.startsWith("baseunit_")
      ) {
        return symbol;
      }

      if (symbol.isComposite()) {
        var ms = [];
        symbol.each(function (x) {
          ms.push(x.multiplier);
        });
        var gcd = Math2.QGCD.apply(null, ms);
        if (gcd.lessThan(0)) {
          symbol.multiplier = symbol.multiplier.multiply(new Frac(-1));
          symbol.distributeMultiplier();
        }
      }

      //convert |n*x| to n*|x|
      var m = _.parse(symbol.multiplier);
      symbol.toUnitMultiplier();

      return _.multiply(m, _.symfunction(ABS, [symbol]));
    }
    /**
     * The factorial function
     * @param {Symbol} symbol
     * @return {Symbol}
     */
    function factorial(symbol) {
      var retval;
      if (isVector(symbol)) {
        var V = new Vector();
        symbol.each(function (x, i) {
          //i start at one.
          V.set(i - 1, factorial(x));
        });
        return V;
      }
      if (isMatrix(symbol)) {
        var M = new Matrix();
        symbol.each(function (x, i, j) {
          //i start at one.
          M.set(i, j, factorial(x));
        });
        return M;
      }
      if (Settings.PARSE2NUMBER && symbol.isConstant()) {
        if (isInt(symbol)) {
          retval = Math2.bigfactorial(symbol);
        } else {
          retval = Math2.gamma(symbol.multiplier.add(new Frac(1)).toDecimal());
        }

        retval = bigConvert(retval);
        return retval;
      } else if (symbol.isConstant()) {
        var den = symbol.getDenom();
        if (den.equals(2)) {
          var num = symbol.getNum();
          var a, b, c, n;

          if (!symbol.multiplier.isNegative()) {
            n = _.add(num, new Symbol(1)).multiplier.divide(new Frac(2));
            a = Math2.bigfactorial(new Frac(2).multiply(n));
            b = _.pow(new Symbol(4), new Symbol(n)).multiplier.multiply(
              Math2.bigfactorial(n),
            );
          } else {
            n = _.subtract(num.negate(), new Symbol(1)).multiplier.divide(
              new Frac(2),
            );
            a = _.pow(new Symbol(-4), new Symbol(n)).multiplier.multiply(
              Math2.bigfactorial(n),
            );
            b = Math2.bigfactorial(new Frac(2).multiply(n));
          }
          c = a.divide(b);
          return _.multiply(_.parse("sqrt(pi)"), new Symbol(c));
        }
      }
      return _.symfunction(FACTORIAL, [symbol]);
    }
    /**
     * Returns the continued fraction of a number
     * @param {Symbol} symbol
     * @param {Symbol} n
     * @returns {Symbol}
     */
    function continued_fraction(symbol, n) {
      var _symbol = evaluate(symbol);
      if (_symbol.isConstant()) {
        var cf = Math2.continuedFraction(_symbol, n);
        //convert the fractions array to a new Vector
        var fractions = Vector.fromArray(
          cf.fractions.map(function (x) {
            return new Symbol(x);
          }),
        );
        return Vector.fromArray([
          new Symbol(cf.sign),
          new Symbol(cf.whole),
          fractions,
        ]);
      }
      return _.symfunction("continued_fraction", arguments);
    }
    /**
     * Returns the error function
     * @param {Symbol} symbol
     * @returns {Symbol}
     */
    function erf(symbol) {
      var _symbol = evaluate(symbol);

      if (_symbol.isConstant()) {
        return Math2.erf(_symbol);
      } else if (_symbol.isImaginary()) {
        return complex.erf(symbol);
      }
      return _.symfunction("erf", arguments);
    }
    /**
     * The mod function
     * @param {Symbol} symbol1
     * @param {Symbol} symbol2
     * @returns {Symbol}
     */
    function mod(symbol1, symbol2) {
      if (symbol1.isConstant() && symbol2.isConstant()) {
        var retval = new Symbol(1);
        retval.multiplier = retval.multiplier.multiply(
          symbol1.multiplier.mod(symbol2.multiplier),
        );
        return retval;
      }
      //try to see if division has remainder of zero
      var r = _.divide(symbol1.clone(), symbol2.clone());
      if (isInt(r)) return new Symbol(0);
      return _.symfunction("mod", [symbol1, symbol2]);
    }
    /**
     * A branghing function
     * @param {Boolean} condition
     * @param {Symbol} a
     * @param {Symbol} b
     * @returns {Symbol}
     */
    function IF(condition, a, b) {
      if (typeof condition !== "boolean")
        if (isNumericSymbol(condition)) condition = !!Number(condition);
      if (condition) return a;
      return b;
    }
    /**
     *
     * @param {Matrix|Vector|Set|Collection} obj
     * @param {Symbol} item
     * @returns {Boolean}
     */
    function is_in(obj, item) {
      if (isMatrix(obj)) {
        for (var i = 0, l = obj.rows(); i < l; i++) {
          for (var j = 0, l2 = obj.cols(); j < l2; j++) {
            var element = obj.elements[i][j];
            if (element.equals(item)) return new Symbol(1);
          }
        }
      } else if (obj.elements) {
        for (var i = 0, l = obj.elements.length; i < l; i++) {
          if (obj.elements[i].equals(item)) return new Symbol(1);
        }
      }

      return new Symbol(0);
    }

    /**
     * A symbolic extension for sinc
     * @param {Symbol} symbol
     * @returns {Symbol}
     */
    function sinc(symbol) {
      if (Settings.PARSE2NUMBER) {
        if (symbol.isConstant()) {
          return new Symbol(Math2.sinc(symbol));
        }
        return _.parse(format("sin({0})/({0})", symbol));
      }
      return _.symfunction("sinc", [symbol]);
    }

    /**
     * A symbolic extension for exp. This will auto-convert all instances of exp(x) to e^x.
     * Thanks @ Happypig375
     * @param {Symbol} symbol
     * @returns {Symbol}
     */
    function exp(symbol) {
      if (symbol.fname === Settings.LOG && symbol.isLinear()) {
        return _.pow(symbol.args[0], Symbol.create(symbol.multiplier));
      }
      return _.parse(format("e^({0})", symbol));
    }

    /**
     * Converts value degrees to radians
     * @param {Symbol} symbol
     * @returns {Symbol}
     */
    function radians(symbol) {
      return _.parse(format("({0})*pi/180", symbol));
    }

    /**
     * Converts value from radians to degrees
     * @param {Symbol} symbol
     * @returns {Symbol}
     */
    function degrees(symbol) {
      return _.parse(format("({0})*180/pi", symbol));
    }

    function nroots(symbol) {
      var a, b;
      if (symbol.group === FN && symbol.fname === "") {
        a = Symbol.unwrapPARENS(_.parse(symbol).toLinear());
        b = _.parse(symbol.power);
      } else if (symbol.group === P) {
        a = _.parse(symbol.value);
        b = _.parse(symbol.power);
      }

      if (a && b && a.group === N && b.group === N) {
        var _roots = [];
        var parts = Symbol.toPolarFormArray(symbol);
        var r = _.parse(a).abs().toString();
        //https://en.wikipedia.org/wiki/De_Moivre%27s_formula
        var x = arg(a).toString();
        var n = b.multiplier.den.toString();
        var p = b.multiplier.num.toString();

        var formula = "(({0})^({1})*(cos({3})+({2})*sin({3})))^({4})";
        for (var i = 0; i < n; i++) {
          var t = evaluate(
            _.parse(format("(({0})+2*pi*({1}))/({2})", x, i, n)),
          ).multiplier.toDecimal();
          _roots.push(
            evaluate(_.parse(format(formula, r, n, Settings.IMAGINARY, t, p))),
          );
        }
        return Vector.fromArray(_roots);
      } else if (symbol.isConstant(true)) {
        var sign = symbol.sign();
        var x = evaluate(symbol.abs());
        var root = _.sqrt(x);

        var _roots = [root.clone(), root.negate()];

        if (sign < 0)
          _roots = _roots.map(function (x) {
            return _.multiply(x, Symbol.imaginary());
          });
      } else {
        _roots = [_.parse(symbol)];
      }

      return Vector.fromArray(_roots);
    }

    /**
     * Rationalizes a symbol
     * @param {Symbol} symbol
     * @returns {Symbol}
     */
    function rationalize(symbol) {
      if (symbol.isComposite()) {
        var retval = new Symbol(0);
        var num, den, retnum, retden, a, b, n, d;
        symbol.each(function (x) {
          num = x.getNum();
          den = x.getDenom();
          retnum = retval.getNum();
          retden = retval.getDenom();
          a = _.multiply(den, retnum);
          b = _.multiply(num, retden);
          n = _.expand(_.add(a, b));
          d = _.multiply(retden, den);
          retval = _.divide(n, d);
        }, true);

        return retval;
      }
      return symbol;
    }

    /**
     * The square root function
     * @param {Symbol} symbol
     * @returns {Symbol}
     */
    function sqrt(symbol) {
      if (!isSymbol(symbol)) {
        symbol = _.parse(symbol);
      }

      const original = _.symfunction("sqrt", [symbol]);

      // Exit early for EX
      if (symbol.group === EX) {
        return _.symfunction(SQRT, [symbol]);
      }

      if (symbol.fname === "" && symbol.power.equals(1))
        symbol = symbol.args[0];

      var is_negative = symbol.multiplier.sign() < 0;

      if (Settings.PARSE2NUMBER) {
        if (symbol.isConstant() && !is_negative) {
          return new Symbol(bigDec.sqrt(symbol.multiplier.toDecimal()));
        } else if (symbol.isImaginary()) {
          return complex.sqrt(symbol);
        } else if (symbol.group === S) {
          return _.symfunction("sqrt", [symbol]);
        }
      }

      var img,
        retval,
        isConstant = symbol.isConstant();

      if (symbol.group === CB && symbol.isLinear()) {
        var m = sqrt(Symbol(symbol.multiplier));
        for (var s in symbol.symbols) {
          var x = symbol.symbols[s];
          m = _.multiply(m, sqrt(x));
        }

        retval = m;
      }
      //if the symbol is already sqrt then it's that symbol^(1/4) and we can unwrap it
      else if (symbol.fname === SQRT) {
        var s = symbol.args[0];
        var ms = symbol.multiplier;
        s.setPower(symbol.power.multiply(new Frac(0.25)));
        retval = s;
        //grab the multiplier
        if (!ms.equals(1)) retval = _.multiply(sqrt(_.parse(ms)), retval);
      }
      //if the symbol is a fraction then we don't keep can unwrap it. For instance
      //no need to keep sqrt(x^(1/3))
      else if (!symbol.power.isInteger()) {
        symbol.setPower(symbol.power.multiply(new Frac(0.5)));
        retval = symbol;
      } else if (symbol.multiplier < 0 && symbol.group === S) {
        var a = _.parse(symbol.multiplier).negate();
        var b = _.parse(symbol).toUnitMultiplier().negate();
        retval = _.multiply(_.symfunction(Settings.SQRT, [b]), sqrt(a));
      } else {
        //Related to issue #401. Since sqrt(a)*sqrt(b^-1) relates in issues, we'll change the form
        //to sqrt(a)*sqrt(b)^1 for better simplification
        //the sign of the power
        var sign = symbol.power.sign();
        //remove the sign
        symbol.power = symbol.power.abs();

        //if the symbols is imagary then we place in the imaginary part. We'll return it
        //as a product
        if (isConstant && symbol.multiplier.lessThan(0)) {
          img = Symbol.imaginary();
          symbol.multiplier = symbol.multiplier.abs();
        }

        var q = symbol.multiplier.toDecimal(),
          qa = Math.abs(q),
          t = Math.sqrt(qa);

        var m;
        //it's a perfect square so take the square
        if (isInt(t)) {
          m = new Symbol(t);
        } else if (isInt(q)) {
          var factors = Math2.ifactor(q);
          var tw = 1;
          for (var x in factors) {
            var n = factors[x],
              nn = n - (n % 2); //get out the whole numbers
            if (nn) {
              //if there is a whole number ...
              var w = Math.pow(x, nn);
              tw *= Math.pow(x, nn / 2); //add to total wholes
              q /= w; //reduce the number by the wholes
            }
          }
          m = _.multiply(_.symfunction(SQRT, [new Symbol(q)]), new Symbol(tw));
        } else {
          //reduce the numerator and denominator using prime factorization
          var c = [
            new Symbol(symbol.multiplier.num),
            new Symbol(symbol.multiplier.den),
          ];
          var r = [new Symbol(1), new Symbol(1)];
          var sq = [new Symbol(1), new Symbol(1)];
          for (var i = 0; i < 2; i++) {
            var n = c[i];
            //get the prime factors and loop through each.
            pfactor(n).each(function (x) {
              x = Symbol.unwrapPARENS(x);
              var b = x.clone().toLinear();
              var p = Number(x.power);
              //We'll consider it safe to use the native Number since 2^1000 is already a pretty huge number
              var rem = p % 2; //get the remainder. This will be 1 if 3 since sqrt(n^2) = n where n is positive
              var w = (p - rem) / 2; //get the whole numbers of n/2
              r[i] = _.multiply(r[i], _.pow(b, new Symbol(w)));
              sq[i] = _.multiply(sq[i], sqrt(_.pow(b, new Symbol(rem))));
            });
          }
          m = _.divide(_.multiply(r[0], sq[0]), _.multiply(r[1], sq[1]));
        }

        //strip the multiplier since we already took the sqrt
        symbol = symbol.toUnitMultiplier(true);
        //if the symbol is one just return one and not the sqrt function
        if (symbol.isOne()) {
          retval = symbol;
        } else if (even(symbol.power.toString())) {
          //just raise it to the 1/2
          retval = _.pow(symbol.clone(), new Symbol(0.5));
        } else {
          retval = _.symfunction(SQRT, [symbol]);
        }

        //put back the sign that was removed earlier
        if (sign < 0) retval.power.negate();

        if (m) retval = _.multiply(m, retval);

        if (img) retval = _.multiply(img, retval);
      }

      if (
        is_negative &&
        Settings.PARSE2NUMBER &&
        retval.text() !== original.text()
      ) {
        return _.parse(retval);
      }

      return retval;
    }

    /**
     * The cube root function
     * @param {Symbol} symbol
     * @returns {Symbol}
     */
    function cbrt(symbol) {
      if (!symbol.isConstant(true)) {
        var retval;

        var n = symbol.power / 3;
        //take the cube root of the multplier
        var m = _.pow(_.parse(symbol.multiplier), new Symbol(1 / 3));
        //strip the multiplier
        var sym = symbol.toUnitMultiplier();

        //simplify the power
        if (isInt(n)) {
          retval = _.pow(sym.toLinear(), _.parse(n));
        } else {
          if (sym.group === CB) {
            retval = new Symbol(1);
            sym.each(function (x) {
              retval = _.multiply(retval, cbrt(x));
            });
          } else {
            retval = _.symfunction("cbrt", [sym]);
          }
        }

        return _.multiply(m, retval);
      }
      return nthroot(symbol, new Symbol(3));
    }

    function scientific(symbol, sigfigs) {
      //Just set the flag and keep it moving. Symbol.toString will deal with how to
      //display this
      symbol.scientific = sigfigs || 10;
      return symbol;
    }

    /**
     *
     * @param {Symbol} num - the number being raised
     * @param {Symbol} p - the exponent
     * @param {type} prec - the precision wanted
     * @param {bool} asbig - true if a bigDecimal is wanted
     * @returns {Symbol}
     */
    function nthroot(num, p, prec, asbig) {
      //clone p and convert to a number if possible
      p = evaluate(_.parse(p));

      //cannot calculate if p = 0. nthroot(0, 0) => 0^(1/0) => undefined
      if (p.equals(0)) {
        throw new UndefinedError("Unable to calculate nthroots of zero");
      }

      //Stop computation if it negative and even since we have an imaginary result
      if (num < 0 && even(p))
        throw new Error(
          "Cannot calculate nthroot of negative number for even powers",
        );

      //return non numeric values unevaluated
      if (!num.isConstant(true)) {
        return _.symfunction("nthroot", arguments);
      }

      //evaluate numeric values
      if (num.group !== N) {
        num = evaluate(num);
      }

      //default is to return a big value
      if (typeof asbig === "undefined") asbig = true;

      prec = prec || 25;

      var sign = num.sign();
      var retval;
      var ans;

      if (sign < 0) {
        num = abs(num); //remove the sign
      }

      if (isInt(num) && p.isConstant()) {
        if (num < 18446744073709551616) {
          //2^64
          ans = Frac.create(Math.pow(num, 1 / p));
        } else {
          ans = Math2.nthroot(num, p);
        }

        var retval;
        if (asbig) {
          retval = new Symbol(ans);
        }
        retval = new Symbol(ans.toDecimal(prec));

        return _.multiply(new Symbol(sign), retval);
      }
    }

    function pfactor(symbol) {
      //Fix issue #458 | nerdamer("sqrt(1-(3.3333333550520926e-7)^2)").evaluate().text()
      //More Big Number issues >:(
      if (symbol.greaterThan(9.999999999998891e41) || symbol.equals(-1))
        return symbol;
      //Fix issue #298
      if (symbol.equals(Math.PI)) return new Symbol(Math.PI);
      //evaluate the symbol to merge constants
      symbol = evaluate(symbol.clone());

      if (symbol.isConstant()) {
        var retval = new Symbol(1);
        var m = symbol.toString();
        if (isInt(m)) {
          var factors = Math2.ifactor(m);
          for (var factor in factors) {
            var p = factors[factor];
            retval = _.multiply(
              retval,
              _.symfunction("parens", [
                new Symbol(factor).setPower(new Frac(p)),
              ]),
            );
          }
        } else {
          var n = pfactor(new Symbol(symbol.multiplier.num));
          var d = pfactor(new Symbol(symbol.multiplier.den));
          retval = _.multiply(
            _.symfunction("parens", [n]),
            _.symfunction("parens", [d]).invert(),
          );
        }
      } else retval = _.symfunction("pfactor", arguments);
      return retval;
    }

    /**
     * Get's the real part of a complex number. Return number if real
     * @param {Symbol} symbol
     * @returns {Symbol}
     */
    function realpart(symbol) {
      return symbol.realpart();
    }

    /**
     * Get's the imaginary part of a complex number
     * @param {Symbol} symbol
     * @returns {Symbol}
     */
    function imagpart(symbol) {
      return symbol.imagpart();
    }

    /**
     * Computes the conjugate of a complex number
     * @param {Symbol} symbol
     * @returns {Symbol}
     */
    function conjugate(symbol) {
      var re = symbol.realpart();
      var im = symbol.imagpart();
      return _.add(re, _.multiply(im.negate(), Symbol.imaginary()));
    }

    /**
     * Returns the arugment of a complex number
     * @param {Symbol} symbol
     * @returns {Symbol}
     */
    function arg(symbol) {
      var re = symbol.realpart();
      var im = symbol.imagpart();
      if (re.isConstant() && im.isConstant())
        return new Symbol(Math.atan2(im, re));
      return _.symfunction("atan2", [im, re]);
    }

    /**
     * Returns the arugment of a complex number
     * @param {Symbol} symbol
     * @returns {Symbol}
     */
    function arg(symbol) {
      var re = symbol.realpart();
      var im = symbol.imagpart();
      if (re.isConstant() && im.isConstant()) {
        // right angles
        if (im.equals(0) && re.equals(1)) {
          return _.parse("0");
        } else if (im.equals(1) && re.equals(0)) {
          return _.parse("pi/2");
        }
        if (im.equals(0) && re.equals(-1)) {
          return _.parse("pi");
        } else if (im.equals(-1) && re.equals(0)) {
          return _.parse("-pi/2");
        }

        // 45 degrees
        else if (im.equals(1) && re.equals(1)) {
          return _.parse("pi/4");
        } else if (im.equals(1) && re.equals(-1)) {
          return _.parse("pi*3/4");
        } else if (im.equals(-1) && re.equals(1)) {
          return _.parse("-pi/4");
        } else if (im.equals(-1) && re.equals(-1)) {
          return _.parse("-pi*3/4");
        }

        // all the rest
        return new Symbol(Math.atan2(im, re));
      }
      return _.symfunction("atan2", [im, re]);
    }

    /**
     * Returns the polarform of a complex number
     * @param {Symbol} symbol
     * @returns {Symbol}
     */
    function polarform(symbol) {
      var p, r, e, theta;
      p = Symbol.toPolarFormArray(symbol);
      theta = p[1];
      r = p[0];
      e = _.parse(format("e^({0}*({1}))", Settings.IMAGINARY, theta));
      return _.multiply(r, e);
    }

    /**
     * Returns the rectangular form of a complex number. Does not work for symbolic coefficients
     * @param {Symbol} symbol
     * @returns {Symbol}
     */
    function rectform(symbol) {
      //TODO: e^((i*pi)/4)
      var original = symbol.clone();
      try {
        var f, p, q, s, h, d, n;
        f = decompose_fn(symbol, "e", true);
        p = _.divide(f.x.power, Symbol.imaginary());
        q = evaluate(trig.tan(p));
        s = _.pow(f.a, new Symbol(2));
        d = q.getDenom(true);
        n = q.getNum();
        h = Symbol.hyp(n, d);
        //check
        if (h.equals(f.a)) {
          return _.add(d, _.multiply(Symbol.imaginary(), n));
        } else {
          return original;
        }
      } catch (e) {
        if (e.message === "timeout") throw e;
        return original;
      }
    }

    function symMinMax(f, args) {
      args.map(function (x) {
        x.numVal = evaluate(x).multiplier;
      });
      var l, a, b, a_val, b_val;
      while (true) {
        l = args.length;
        if (l < 2) return args[0];
        a = args.pop();
        b = args[l - 2];
        if (f === "min" ? a.numVal < b.numVal : a.numVal > b.numVal) {
          args.pop();
          args.push(a);
        }
      }
    }

    /**
     * Returns maximum of a set of numbers
     * @returns {Symbol}
     */
    function max() {
      var args = [].slice.call(arguments);
      if (allSame(args)) return args[0];
      if (allNumbers(args)) return new Symbol(Math.max.apply(null, args));
      if (Settings.SYMBOLIC_MIN_MAX && allConstants(args))
        return symMinMax("max", args);
      return _.symfunction("max", args);
    }

    /**
     * Returns minimum of a set of numbers
     * @returns {Symbol}
     */
    function min() {
      var args = [].slice.call(arguments);
      if (allSame(args)) return args[0];
      if (allNumbers(args)) return new Symbol(Math.min.apply(null, args));
      if (Settings.SYMBOLIC_MIN_MAX && allConstants(args))
        return symMinMax("min", args);
      return _.symfunction("min", args);
    }

    /**
     * Returns the sign of a number
     * @param {Symbol} x
     * @returns {Symbol}
     */
    function sign(x) {
      if (x.isConstant(true)) return new Symbol(Math.sign(evaluate(x)));
      return _.symfunction("sign", arguments);
    }

    function sort(symbol, opt) {
      opt = opt ? opt.toString() : "asc";
      var getval = function (e) {
        if (e.group === N) return e.multiplier;
        if (e.group === FN) {
          if (e.fname === "") return getval(e.args[0]);
          return e.fname;
        }
        if (e.group === S) return e.power;

        return e.value;
      };
      var symbols = isVector(symbol)
        ? symbol.elements
        : symbol.collectSymbols();
      return new Vector(
        symbols.sort(function (a, b) {
          var aval = getval(a),
            bval = getval(b);
          if (opt === "desc") return bval - aval;
          return aval - bval;
        }),
      );
    }

    /**
     * The log function
     * @param {Symbol} symbol
     * @param {Symbol} base
     * @returns {Symbol}
     */
    function log(symbol, base) {
      if (symbol.equals(1)) {
        return new Symbol(0);
      }

      var retval;

      if (symbol.fname === SQRT && symbol.multiplier.equals(1)) {
        retval = _.divide(log(symbol.args[0]), new Symbol(2));

        if (symbol.power.sign() < 0) {
          retval.negate();
        }

        // Exit early
        return retval;
      }

      //log(0) is undefined so complain
      if (symbol.equals(0)) {
        throw new UndefinedError(Settings.LOG + "(0) is undefined!");
      }

      //deal with imaginary values
      if (symbol.isImaginary()) {
        return complex.evaluate(symbol, Settings.LOG);
      }

      if (
        symbol.isConstant() &&
        typeof base !== "undefined" &&
        base.isConstant()
      ) {
        var log_sym = Math.log(symbol);
        var log_base = Math.log(base);
        retval = new Symbol(log_sym / log_base);
      } else if (
        (symbol.group === EX && symbol.power.multiplier.lessThan(0)) ||
        symbol.power.toString() === "-1"
      ) {
        symbol.power.negate();
        //move the negative outside but keep the positive inside :)
        retval = log(symbol).negate();
      } else if (symbol.value === "e" && symbol.multiplier.equals(1)) {
        var p = symbol.power;
        retval = isSymbol(p) ? p : new Symbol(p);
      } else if (symbol.group === FN && symbol.fname === "exp") {
        var s = symbol.args[0];
        if (symbol.multiplier.equals(1))
          retval = _.multiply(s, new Symbol(symbol.power));
        else retval = _.symfunction(Settings.LOG, [symbol]);
      } else if (Settings.PARSE2NUMBER && isNumericSymbol(symbol)) {
        // Parse for safety.
        symbol = _.parse(symbol);

        var img_part;
        if (symbol.multiplier.lessThan(0)) {
          symbol.negate();
          img_part = _.multiply(new Symbol(Math.PI), new Symbol("i"));
        }

        retval = new Symbol(Math.log(symbol.multiplier.toDecimal()));

        if (img_part) {
          retval = _.add(retval, img_part);
        }
      } else {
        var s;
        if (
          !symbol.power.equals(1) &&
          !symbol.contains("e") &&
          symbol.multiplier.isOne()
        ) {
          s = symbol.group === EX ? symbol.power : new Symbol(symbol.power);
          symbol.toLinear();
        }
        //log(a,a) = 1 since the base is allowed to be changed.
        //This was pointed out by Happypig375 in issue #280
        if (arguments.length > 1 && allSame(arguments)) {
          retval = new Symbol(1);
        } else {
          retval = _.symfunction(Settings.LOG, arguments);
        }

        if (s) {
          retval = _.multiply(s, retval);
        }
      }

      return retval;
    }

    /**
     * Round a number up to s decimal places
     * @param {Number} x
     * @param {int} s - the number of decimal places
     * @returns {undefined}
     */
    function round(x, s) {
      var sIsConstant = (s && s.isConstant()) || typeof s === "undefined";
      if (x.isConstant() && sIsConstant) {
        var v, e, exp, retval;
        v = x;
        //round the coefficient of then number but not the actual decimal value
        //we know this because a negative number was passed
        if (s && s.lessThan(0)) {
          s = abs(s);
          //convert the number to exponential form
          e = Number(x).toExponential().toString().split("e");
          //point v to the coefficient of then number
          v = e[0];
          //set the expontent
          exp = e[1];
        }
        //round the number to the requested precision
        retval = new Symbol(nround(v, Number(s || 0)));
        //if there's a exponent then put it back
        return _.multiply(retval, _.pow(new Symbol(10), new Symbol(exp || 0)));
      }

      return _.symfunction("round", arguments);
    }

    /**
     * Gets the quadrant of the trig function
     * @param {Frac} m
     * @returns {Int}
     */
    function getQuadrant(m) {
      var v = m % 2,
        quadrant;

      if (v < 0) v = 2 + v; //put it in terms of pi

      if (v >= 0 && v <= 0.5) quadrant = 1;
      else if (v > 0.5 && v <= 1) quadrant = 2;
      else if (v > 1 && v <= 1.5) quadrant = 3;
      else quadrant = 4;
      return quadrant;
    }

    /*
     * Serves as a bridge between numbers and bigNumbers
     * @param {Frac|Number} n
     * @returns {Symbol}
     */
    function bigConvert(n) {
      if (!isFinite(n)) {
        var sign = Math.sign(n);
        var r = new Symbol(String(Math.abs(n)));
        r.multiplier = r.multiplier.multiply(new Frac(sign));
        return r;
      }
      if (isSymbol(n)) return n;
      if (typeof n === "number") {
        try {
          n = Frac.simple(n);
        } catch (e) {
          if (e.message === "timeout") throw e;
          n = new Frac(n);
        }
      }

      var symbol = new Symbol(0);
      symbol.multiplier = n;
      return symbol;
    }
    function clean(symbol) {
      // handle functions with numeric values
      // handle denominator within denominator
      // handle trig simplifications
      var g = symbol.group,
        retval;
      //Now let's get to work
      if (g === CP) {
        var num = symbol.getNum(),
          den = symbol.getDenom() || new Symbol(1),
          p = Number(symbol.power),
          factor = new Symbol(1);
        if (Math.abs(p) === 1) {
          den.each(function (x) {
            if (x.group === CB) {
              factor = _.multiply(factor, clean(x.getDenom()));
            } else if (x.power.lessThan(0)) {
              factor = _.multiply(factor, clean(x.clone().toUnitMultiplier()));
            }
          });

          var new_den = new Symbol(0);
          //now divide out the factor and add to new den
          den.each(function (x) {
            new_den = _.add(_.divide(x, factor.clone()), new_den);
          });

          factor.invert(); //invert so it can be added to the top
          var new_num;
          if (num.isComposite()) {
            new_num = new Symbol(0);
            num.each(function (x) {
              new_num = _.add(_.multiply(clean(x), factor.clone()), new_num);
            });
          } else new_num = _.multiply(factor, num);

          retval = _.divide(new_num, new_den);
        }
      } else if (g === CB) {
        retval = new Symbol(1);
        symbol.each(function (x) {
          retval = _.multiply(retval, _.clean(x));
        });
      } else if (g === FN) {
        if (symbol.args.length === 1 && symbol.args[0].isConstant())
          retval = block(
            "PARSE2NUMBER",
            function () {
              return _.parse(symbol);
            },
            true,
          );
      }

      if (!retval) retval = symbol;

      return retval;
    }

    /**
     * A wrapper for the expand function
     * @param {Symbol} symbol
     * @returns {Symbol}
     */
    function expandall(symbol, opt) {
      opt = opt || {
        expand_denominator: true,
        expand_functions: true,
      };
      return expand(symbol, opt);
    }
    /**
     * Expands a symbol
     * @param symbol
     */
    // Old expand
    function expand(symbol, opt) {
      if (Array.isArray(symbol)) {
        return symbol.map(function (x) {
          return expand(x, opt);
        });
      }
      if (symbol.expand) {
        return symbol.expand(opt);
      }
      opt = opt || {};
      //deal with parenthesis
      if (symbol.group === FN && symbol.fname === "") {
        var f = expand(symbol.args[0], opt);
        var x = expand(_.pow(f, _.parse(symbol.power)), opt);
        return _.multiply(_.parse(symbol.multiplier), x).distributeMultiplier();
      }
      // We cannot expand these groups so no need to waste time. Just return and be done.
      if ([N, P, S].indexOf(symbol.group) !== -1) {
        return symbol; //nothing to do
      }

      var original = symbol.clone();

      // Set up a try-catch block. If anything goes wrong then we simply return the original symbol
      try {
        // Store the power and multiplier
        var m = symbol.multiplier.toString();
        var p = Number(symbol.power);
        var retval = symbol;

        // Handle (a+b)^2 | (x+x^2)^2
        if (symbol.isComposite() && isInt(symbol.power) && symbol.power > 0) {
          var n = p - 1;
          // Strip the expression of it's multiplier and power. We'll call it f. The power will be p and the multiplier m.
          var f = new Symbol(0);

          symbol.each(function (x) {
            f = _.add(f, expand(_.parse(x), opt));
          });

          var expanded = _.parse(f);

          for (var i = 0; i < n; i++) {
            expanded = mix(expanded, f, opt);
          }

          retval = _.multiply(_.parse(m), expanded).distributeMultiplier();
        } else if (symbol.group === FN && opt.expand_functions === true) {
          var args = [];
          // Expand function the arguments
          symbol.args.forEach(function (x) {
            args.push(expand(x, opt));
          });
          // Put back the power and multiplier
          retval = _.pow(
            _.symfunction(symbol.fname, args),
            _.parse(symbol.power),
          );
          retval = _.multiply(retval, _.parse(symbol.multiplier));
        } else if (
          symbol.isComposite() &&
          isInt(symbol.power) &&
          symbol.power < 0 &&
          opt.expand_denominator === true
        ) {
          // Invert it. Expand it and then re-invert it.
          symbol = symbol.invert();
          retval = expand(symbol, opt);
          retval.invert();
        } else if (symbol.group === CB) {
          var rank = function (s) {
            switch (s.group) {
              case CP:
                return 0;
              case PL:
                return 1;
              case CB:
                return 2;
              case FN:
                return 3;
              default:
                return 4;
            }
          };
          // Consider (a+b)(c+d). The result will be (a*c+a*d)+(b*c+b*d).
          // We start by moving collecting the symbols. We want others>FN>CB>PL>CP
          var symbols = symbol
            .collectSymbols()
            .sort(function (a, b) {
              return rank(b) - rank(a);
            })
            // Distribute the power to each symbol and expand
            .map(function (s) {
              var x = _.pow(s, _.parse(p));
              var e = expand(x, opt);
              return e;
            });

          var f = symbols.pop();

          // If the first symbols isn't a composite then we're done
          if (f.isComposite() && f.isLinear()) {
            symbols.forEach(function (s) {
              f = mix(f, s, opt);
            });

            // If f is of group PL or CP then we can expand some more
            if (f.isComposite()) {
              if (f.power > 1) {
                f = expand(_.pow(f, _.parse(f.power)), opt);
              }
              // Put back the multiplier
              retval = _.multiply(_.parse(m), f).distributeMultiplier();
            } else {
              // Everything is expanded at this point so if it's still a CB
              // then just return the symbol
              retval = f;
            }
          } else {
            // Just multiply back in the expanded form of each
            retval = f;
            symbols.forEach(function (s) {
              retval = _.multiply(retval, s);
            });
            // Put back the multiplier
            retval = _.multiply(retval, _.parse(m)).distributeMultiplier();
          }

          // TODO: This exists solely as a quick fix for sqrt(11)*sqrt(33) not simplifying.
          if (retval.group === CB) {
            retval = _.parse(retval);
          }
        } else {
          // Otherwise just return the expression
          retval = symbol;
        }
        // Final cleanup and return
        return retval;
      } catch (e) {
        if (e.message === "timeout") throw e;
        return original;
      }

      return original;
    }

    /**
     * Returns an identity matrix of nxn
     * @param {Number} n
     * @returns {Matrix}
     */
    function imatrix(n) {
      return Matrix.identity(n);
    }

    /**
     * Retrieves and item from a vector
     * @param {Vector} vector
     * @param {Number} index
     * @returns {Vector|Symbol}
     */
    function vecget(vector, index) {
      if (index.isConstant() && isInt(index)) return vector.elements[index];
      return _.symfunction("vecget", arguments);
    }

    /**
     * Removes duplicates from a vector
     * @param {Vector} vector
     * @param {Number} tolerance
     * @returns {Vector}
     */
    function vectrim(vector, tolerance) {
      tolerance = typeof tolerance === "undefined" ? 1e-14 : tolerance;

      vector = vector.clone();

      tolerance = Number(tolerance);
      //place algebraic solutions first
      vector.elements.sort(function (a, b) {
        return b.group - a.group;
      });
      //depending on the start point we may have duplicates so we need to clean those up a bit.
      //start by creating an object with the solution and the numeric value. This way we don't destroy algebraic values
      vector.elements = removeDuplicates(vector.elements, function (a, b) {
        var diff = Number(_.subtract(evaluate(a), evaluate(b)).abs());
        return diff <= tolerance;
      });

      return vector;
    }

    /**
     * Set a value for a vector at a given index
     * @param {Vector} vector
     * @param {Number} index
     * @param {Symbol} value
     * @returns {Vector}
     */
    function vecset(vector, index, value) {
      if (!index.isConstant) return _.symfunction("vecset", arguments);
      vector.elements[index] = value;
      return vector;
    }

    function matget(matrix, i, j) {
      if (i.isConstant() && j.isConstant()) return matrix.elements[i][j];
      return _.symfunction("matget", arguments);
    }

    function matgetrow(matrix, i) {
      if (i.isConstant()) return new Matrix(matrix.elements[i]);
      return _.symfunction("matgetrow", arguments);
    }

    function matsetrow(matrix, i, x) {
      //handle symbolics
      if (!i.isConstant()) return _.symfunction("matsetrow", arguments);
      if (matrix.elements[i].length !== x.elements.length)
        throw new DimensionError("Matrix row must match row dimensions!");
      var M = matrix.clone();
      M.elements[i] = x.clone().elements;
      return M;
    }

    function matgetcol(matrix, col_index) {
      //handle symbolics
      if (!col_index.isConstant()) return _.symfunction("matgetcol", arguments);
      col_index = Number(col_index);
      var M = Matrix.fromArray([]);
      matrix.each(function (x, i, j) {
        if (j === col_index) {
          M.elements.push([x.clone()]);
        }
      });
      return M;
    }

    function matsetcol(matrix, j, col) {
      //handle symbolics
      if (!j.isConstant()) return _.symfunction("matsetcol", arguments);
      j = Number(j);
      if (matrix.rows() !== col.elements.length)
        throw new DimensionError(
          "Matrix column length must match number of rows!",
        );
      col.each(function (x, i) {
        matrix.set(i - 1, j, x.elements[0].clone());
      });
      return matrix;
    }

    function matset(matrix, i, j, value) {
      matrix.elements[i][j] = value;
      return matrix;
    }

    //the constructor for vectors
    function vector() {
      return new Vector([].slice.call(arguments));
    }

    //the constructor for matrices
    function matrix() {
      return Matrix.fromArray(arguments);
    }

    //the constructor for sets
    function set() {
      return Set.fromArray(arguments);
    }

    function determinant(symbol) {
      if (isMatrix(symbol)) {
        return symbol.determinant();
      }
      return symbol;
    }

    function size(symbol) {
      var retval;
      if (isMatrix(symbol))
        retval = [new Symbol(symbol.cols()), new Symbol(symbol.rows())];
      else if (isVector(symbol) || isSet(symbol))
        retval = new Symbol(symbol.elements.length);
      else err("size expects a matrix or a vector");
      return retval;
    }

    function dot(vec1, vec2) {
      if (isMatrix(vec1)) {
        vec1 = new Vector(vec1);
      }
      if (isMatrix(vec2)) {
        vec2 = new Vector(vec2);
      }

      if (isVector(vec1) && isVector(vec2)) return vec1.dot(vec2);

      return _.multiply(vec1.clone(), vec2.clone());
      // err('function dot expects 2 vectors');
    }

    function cross(vec1, vec2) {
      if (isMatrix(vec1)) {
        vec1 = new Vector(vec1);
      }
      if (isMatrix(vec2)) {
        vec2 = new Vector(vec2);
      }

      if (isVector(vec1) && isVector(vec2)) return vec1.cross(vec2);

      return _.multiply(vec1.clone(), vec2.clone());
      // err('function cross expects 2 vectors');
    }

    function transpose(mat) {
      if (isMatrix(mat)) return mat.transpose();
      err("function transpose expects a matrix");
    }

    function invert(mat) {
      if (isMatrix(mat)) return mat.invert();
      err("invert expects a matrix");
    }

    //basic set functions
    function union(set1, set2) {
      return set1.union(set2);
    }

    function intersection(set1, set2) {
      return set1.intersection(set2);
    }

    function contains(set1, e) {
      return set1.contains(e);
    }

    function difference(set1, set2) {
      return set1.difference(set2);
    }

    function intersects(set1, set2) {
      return new Symbol(Number(set1.intersects(set2)));
    }

    function is_subset(set1, set2) {
      return new Symbol(Number(set1.is_subset(set2)));
    }

    function print() {
      arguments2Array(arguments).map(function (x) {
        console.log(x.toString());
      });
    }

    function testSQRT(symbol) {
      //wrap the symbol in sqrt. This eliminates one more check down the line.
      if (!isSymbol(symbol.power) && symbol.power.absEquals(0.5)) {
        var sign = symbol.power.sign();
        //don't devide the power directly. Notice the use of toString. This makes it possible
        //to use a bigNumber library in the future
        var retval = sqrt(
          symbol.group === P ? new Symbol(symbol.value) : symbol.toLinear(),
        );
        //place back the sign of the power
        if (sign < 0) retval.invert();
        return retval;
      }
      return symbol;
    }

    //try to reduce a symbol by pulling its power
    function testPow(symbol) {
      if (symbol.group === P) {
        var v = symbol.value;

        var fct = primeFactors(v)[0];

        //safety
        if (!fct) {
          warn(
            "Unable to compute prime factors. This should not happen. Please review and report.",
          );
          return symbol;
        }

        var n = new Frac(Math.log(v) / Math.log(fct)),
          p = n.multiply(symbol.power);

        //we don't want a more complex number than before
        if (p.den > symbol.power.den) return symbol;

        if (isInt(p)) symbol = Symbol(Math.pow(fct, p));
        else symbol = new Symbol(fct).setPower(p);
      }

      return symbol;
    }

    //Link the functions to the parse so they're available outside of the library.
    //This is strictly for convenience and may be deprecated.
    this.expand = expand;
    this.round = round;
    this.clean = clean;
    this.sqrt = sqrt;
    this.cbrt = cbrt;
    this.abs = abs;
    this.log = log;
    this.rationalize = rationalize;
    this.nthroot = nthroot;
    this.arg = arg;
    this.conjugate = conjugate;
    this.imagpart = imagpart;
    this.realpart = realpart;

    //TODO:
    //Utilize the function below instead of the linked function
    this.getFunction = function (name) {
      return functions[name][0];
    };

    //Parser.methods ===============================================================
    this.addPreprocessor = function (name, action, order, shift_cells) {
      var names = preprocessors.names;
      var actions = preprocessors.actions;
      if (typeof action !== "function")
        //the person probably forgot to specify a name
        throw new PreprocessorError("Incorrect parameters. Function expected!");
      if (!order) {
        names.push(name);
        actions.push(action);
      } else {
        if (shift_cells) {
          names.splice(order, 0, name);
          actions.splice(order, 0, action);
        } else {
          names[order] = name;
          actions[order] = action;
        }
      }
    };

    this.getPreprocessors = function () {
      var preprocessors = {};
      for (var i = 0, l = preprocessors.names.length; i < l; i++) {
        var name = preprocessors.names[i];
        preprocessors[name] = {
          order: i,
          action: preprocessors.actions[i],
        };
      }
      return preprocessors;
    };

    this.removePreprocessor = function (name, shift_cells) {
      var i = preprocessors.names.indexOf(name);
      if (shift_cells) {
        remove(preprocessors.names, i);
        remove(preprocessors.actions, i);
      } else {
        preprocessors.names[i] = undefined;
        preprocessors.actions[i] = undefined;
      }
    };

    //The loader for functions which are not part of Math2
    this.mapped_function = function () {
      var subs = {},
        params = this.params;

      for (var i = 0; i < params.length; i++) {
        subs[params[i]] = String(arguments[i]);
      }

      return _.parse(this.body, subs);
    };
    /**
     * Adds two symbols
     * @param {Symbol} a
     * @param {Symbol} b
     * @returns {Symbol}
     */
    this.add = function (a, b) {
      var aIsSymbol = isSymbol(a),
        bIsSymbol = isSymbol(b);
      //we're dealing with two symbols
      if (aIsSymbol && bIsSymbol) {
        //forward the adding of symbols with units to the Unit module
        if (a.unit || b.unit) {
          return _.Unit.add(a, b);
        }
        //handle Infinity
        //https://www.encyclopediaofmath.org/index.php/Infinity
        if (a.isInfinity || b.isInfinity) {
          var aneg = a.multiplier.lessThan(0),
            bneg = b.multiplier.lessThan(0);

          if (a.isInfinity && b.isInfinity && aneg !== bneg) {
            throw new UndefinedError("(" + a + ")+(" + b + ") is not defined!");
          }

          var inf = Symbol.infinity();
          if (bneg) inf.negate();
          return inf;
        }

        if (
          a.isComposite() &&
          a.isLinear() &&
          b.isComposite() &&
          b.isLinear()
        ) {
          a.distributeMultiplier();
          b.distributeMultiplier();
          // Fix for issue #606
          if (b.length > a.length && a.group === b.group) {
            [a, b] = [b, a];
          }
        }

        //no need to waste time on zeroes
        if (a.multiplier.equals(0)) return b;
        if (b.multiplier.equals(0)) return a;

        if (a.isConstant() && b.isConstant() && Settings.PARSE2NUMBER) {
          var result = new Symbol(
            a.multiplier.add(b.multiplier).toDecimal(Settings.PRECISION),
          );
          return result;
        }

        var g1 = a.group,
          g2 = b.group,
          ap = a.power.toString(),
          bp = b.power.toString();

        //always keep the greater group on the left.
        if (g1 < g2 || (g1 === g2 && ap > bp && bp > 0)) {
          return this.add(b, a);
        }

        /*note to self: Please don't forget about this dilemma ever again. In this model PL and CB goes crazy
         * because it doesn't know which one to prioritize. */
        //correction to PL dilemma
        if (g1 === CB && g2 === PL && a.value === b.value) {
          //swap
          var t = a;
          a = b;
          b = t;
          g1 = a.group;
          g2 = b.group;
          ap = a.power.toString();
          bp = b.power.toString();
        }

        var powEQ = ap === bp,
          v1 = a.value,
          v2 = b.value,
          aIsComposite = a.isComposite(),
          bIsComposite = b.isComposite(),
          h1,
          h2,
          result;

        if (aIsComposite) h1 = text(a, "hash");
        if (bIsComposite) h2 = text(b, "hash");

        if (
          g1 === CP &&
          g2 === CP &&
          b.isLinear() &&
          !a.isLinear() &&
          h1 !== h2
        ) {
          return this.add(b, a);
        }

        //PL & PL should compare hashes and not values e.g. compare x+x^2 with x+x^3 and not x with x
        if (g1 === PL && g2 === PL) {
          v1 = h1;
          v2 = h2;
        }

        var PN = g1 === P && g2 === N,
          PNEQ = a.value === b.multiplier.toString(),
          valEQ = v1 === v2 || (h1 === h2 && h1 !== undefined) || (PN && PNEQ);

        //equal values, equal powers
        if (valEQ && powEQ && g1 === g2) {
          //make sure to convert N to something P can work with
          if (PN) b = b.convert(P); //CL

          //handle PL
          if (g1 === PL && (g2 === S || g2 === P)) {
            a.distributeMultiplier();
            result = a.attach(b);
          } else {
            result = a; //CL
            if (
              a.multiplier.isOne() &&
              b.multiplier.isOne() &&
              g1 === CP &&
              a.isLinear() &&
              b.isLinear()
            ) {
              for (var s in b.symbols) {
                var x = b.symbols[s];
                result.attach(x);
              }
            } else result.multiplier = result.multiplier.add(b.multiplier);
          }
        }
        //equal values uneven powers
        else if (valEQ && g1 !== PL) {
          //break the tie for e.g. (x+1)+((x+1)^2+(x+1)^3)
          if (g1 === CP && g2 === PL) {
            b.insert(a, "add");
            result = b;
          } else {
            result = Symbol.shell(PL).attach([a, b]);
            //update the hash
            result.value = g1 === PL ? h1 : v1;
          }
        } else if (aIsComposite && a.isLinear()) {
          var canIterate = g1 === g2,
            bothPL = g1 === PL && g2 === PL;

          //we can only iterate group PL if they values match
          if (bothPL) canIterate = a.value === b.value;
          //distribute the multiplier over the entire symbol
          a.distributeMultiplier();

          if (b.isComposite() && b.isLinear() && canIterate) {
            b.distributeMultiplier();
            //CL
            for (var s in b.symbols) {
              var x = b.symbols[s];
              a.attach(x);
            }
            result = a;
          }
          //handle cases like 2*(x+x^2)^2+2*(x+x^2)^3+4*(x+x^2)^2
          else if ((bothPL && a.value !== h2) || (g1 === PL && !valEQ)) {
            result = Symbol.shell(CP).attach([a, b]);
            result.updateHash();
          } else {
            result = a.attach(b);
          }
        } else {
          if (
            g1 === FN &&
            a.fname === SQRT &&
            g2 !== EX &&
            b.power.equals(0.5)
          ) {
            var m = b.multiplier.clone();
            b = sqrt(b.toUnitMultiplier().toLinear());
            b.multiplier = m;
          }
          //fix for issue #3 and #159
          if (
            a.length === 2 &&
            b.length === 2 &&
            even(a.power) &&
            even(b.power)
          ) {
            result = _.add(expand(a), expand(b));
          } else {
            result = Symbol.shell(CP).attach([a, b]);
            result.updateHash();
          }
        }

        if (result.multiplier.equals(0)) result = new Symbol(0);

        //make sure to remove unnecessary wraps
        if (result.length === 1) {
          var m = result.multiplier;
          result = firstObject(result.symbols);
          result.multiplier = result.multiplier.multiply(m);
        }

        return result;
      } else {
        //keep symbols to the right
        if (bIsSymbol && !aIsSymbol) {
          var t = a;
          a = b;
          b = t; //swap
          t = bIsSymbol;
          bIsSymbol = aIsSymbol;
          aIsSymbol = t;
        }

        var bIsMatrix = isMatrix(b);

        if (aIsSymbol && bIsMatrix) {
          var M = new Matrix();
          b.eachElement(function (e, i, j) {
            M.set(i, j, _.add(a.clone(), e));
          });

          b = M;
        } else {
          if (isMatrix(a) && bIsMatrix) {
            b = a.add(b);
          } else if (aIsSymbol && isVector(b)) {
            b.each(function (x, i) {
              i--;
              b.elements[i] = _.add(a.clone(), b.elements[i]);
            });
          } else {
            if (isVector(a) && isVector(b)) {
              b.each(function (x, i) {
                i--;
                b.elements[i] = _.add(a.elements[i], b.elements[i]);
              });
            } else if (isVector(a) && isMatrix(b)) {
              //try to convert a to a matrix
              return _.add(b, a);
            } else if (isMatrix(a) && isVector(b)) {
              if (b.elements.length === a.rows()) {
                var M = new Matrix(),
                  l = a.cols();
                b.each(function (e, i) {
                  var row = [];
                  if (isVector(e)) {
                    for (var j = 0; j < l; j++) {
                      row.push(
                        _.add(
                          a.elements[i - 1][j].clone(),
                          e.elements[j].clone(),
                        ),
                      );
                    }
                  } else {
                    for (var j = 0; j < l; j++) {
                      row.push(_.add(a.elements[i - 1][j].clone(), e.clone()));
                    }
                  }
                  M.elements.push(row);
                });
                return M;
              } else err("Dimensions must match!");
            }
          }
        }
        return b;
      }
    };
    /**
     * Gets called when the parser finds the - operator. Not the prefix operator. See this.add
     * @param {Symbol} a
     * @param {Symbol} b
     * @returns {Symbol}
     */
    this.subtract = function (a, b) {
      var aIsSymbol = (aIsSymbol = isSymbol(a)),
        bIsSymbol = isSymbol(b),
        t;

      if (aIsSymbol && bIsSymbol) {
        if (a.unit || b.unit) {
          return _.Unit.subtract(a, b);
        }
        return this.add(a, b.negate());
      } else {
        if (bIsSymbol && isVector(a)) {
          b = a.map(function (x) {
            return _.subtract(x, b.clone());
          });
        } else if (aIsSymbol && isVector(b)) {
          b = b.map(function (x) {
            return _.subtract(a.clone(), x);
          });
        } else if (
          (isVector(a) && isVector(b)) ||
          (isCollection(a) && isCollection(b))
        ) {
          if (a.dimensions() === b.dimensions()) b = a.subtract(b);
          else
            _.error(
              "Unable to subtract vectors/collections. Dimensions do not match.",
            );
        } else if (isMatrix(a) && isVector(b)) {
          if (b.elements.length === a.rows()) {
            var M = new Matrix(),
              l = a.cols();
            b.each(function (e, i) {
              var row = [];
              for (var j = 0; j < l; j++) {
                row.push(_.subtract(a.elements[i - 1][j].clone(), e.clone()));
              }
              M.elements.push(row);
            });
            return M;
          } else err("Dimensions must match!");
        } else if (isVector(a) && isMatrix(b)) {
          var M = b.clone().negate();
          return _.add(M, a);
        } else if (isMatrix(a) && isMatrix(b)) {
          b = a.subtract(b);
        } else if (isMatrix(a) && bIsSymbol) {
          var M = new Matrix();
          a.each(function (x, i, j) {
            M.set(i, j, _.subtract(x, b.clone()));
          });
          b = M;
        } else if (aIsSymbol && isMatrix(b)) {
          var M = new Matrix();
          b.each(function (x, i, j) {
            M.set(i, j, _.subtract(a.clone(), x));
          });
          b = M;
        }
        return b;
      }
    };
    /**
     * Gets called when the parser finds the * operator. See this.add
     * @param {Symbol} a
     * @param {Symbol} b
     * @returns {Symbol}
     */
    this.multiply = function (a, b) {
      var aIsSymbol = isSymbol(a),
        bIsSymbol = isSymbol(b);
      //we're dealing with function assignment here
      if (aIsSymbol && b instanceof Collection) {
        b.elements.push(a);
        return b;
      }
      if (aIsSymbol && bIsSymbol) {
        //if it has a unit then add it and return it right away.
        if (b.isUnit) {
          var result = a.clone();
          a.unit = b;
          return result;
        }

        //if it has units then just forward that problem to the unit module
        if (a.unit || b.unit) {
          return _.Unit.multiply(a, b);
        }

        //handle Infinty
        if (a.isInfinity || b.isInfinity) {
          if (a.equals(0) || b.equals(0))
            throw new UndefinedError(a + "*" + b + " is undefined!");
          //x/infinity
          if (b.power.lessThan(0)) {
            if (!a.isInfinity) {
              return new Symbol(0);
            } else {
              throw new UndefinedError("Infinity/Infinity is not defined!");
            }
          }

          var sign = a.multiplier.multiply(b.multiplier).sign(),
            inf = Symbol.infinity();
          if (
            a.isConstant() ||
            b.isConstant() ||
            (a.isInfinity && b.isInfinity)
          ) {
            if (sign < 0) inf.negate();

            return inf;
          }
        }

        //the quickies
        if (a.multiplier.equals(0) || b.multiplier.equals(0))
          return new Symbol(0);

        if (a.isOne()) {
          return b.clone();
        }
        if (b.isOne()) {
          return a.clone();
        }

        // now we know that neither is 0
        if (a.isConstant() && b.isConstant() && Settings.PARSE2NUMBER) {
          let retval;
          const ad = new bigDec(a.multiplier.toDecimal());
          const bd = new bigDec(b.multiplier.toDecimal());
          if (ad.isZero() || bd.isZero()) {
            // we shouldn't be here - there was a precision underflow.
            // go the long way round to multiply these two (presumed) fractions
            const anum = new bigDec(String(a.multiplier.num));
            const aden = new bigDec(String(a.multiplier.den));
            const bnum = new bigDec(String(b.multiplier.num));
            const bden = new bigDec(String(b.multiplier.den));
            retval = new Symbol(
              anum.times(bnum).dividedBy(aden).dividedBy(bden),
            );
          } else {
            // the original code. still don't know why toFixed()
            var t = ad.times(bd).toFixed();
            retval = new Symbol(t);
          }
          return retval;
        }

        if (b.group > a.group && !(b.group === CP)) return this.multiply(b, a);
        //correction for PL/CB dilemma
        if (a.group === CB && b.group === PL && a.value === b.value) {
          var t = a;
          a = b;
          b = t; //swap
        }

        var g1 = a.group,
          g2 = b.group,
          bnum = b.multiplier.num,
          bden = b.multiplier.den;

        if (
          g1 === FN &&
          a.fname === SQRT &&
          !b.isConstant() &&
          a.args[0].value === b.value &&
          !a.args[0].multiplier.lessThan(0)
        ) {
          //unwrap sqrt
          var a_pow = a.power;
          var a_multiplier = _.parse(a.multiplier);
          a = _.multiply(a_multiplier, a.args[0].clone());
          a.setPower(new Frac(0.5).multiply(a_pow));
          g1 = a.group;
        }
        //simplify n/sqrt(n). Being very specific
        else if (
          g1 === FN &&
          a.fname === SQRT &&
          a.multiplier.equals(1) &&
          a.power.equals(-1) &&
          b.isConstant() &&
          a.args[0].equals(b)
        ) {
          a = _.symfunction(SQRT, [b.clone()]);
          b = new Symbol(1);
        }
        var v1 = a.value,
          v2 = b.value,
          sign = new Frac(a.sign()),
          //since P is just a morphed version of N we need to see if they relate
          ONN = g1 === P && g2 === N && b.multiplier.equals(a.value),
          //don't multiply the multiplier of b since that's equal to the value of a
          m = ONN
            ? new Frac(1).multiply(a.multiplier).abs()
            : a.multiplier.multiply(b.multiplier).abs(),
          result = a.clone().toUnitMultiplier();
        b = b.clone().toUnitMultiplier(true);

        //further simplification of sqrt
        if (g1 === FN && g2 === FN) {
          var u = a.args[0].clone();
          var v = b.args[0].clone();
          if (
            a.fname === SQRT &&
            b.fname === SQRT &&
            a.isLinear() &&
            b.isLinear()
          ) {
            var q = _.divide(u, v).invert();
            if (q.gt(1) && isInt(q)) {
              //b contains a factor a which can be moved to a
              result = _.multiply(a.args[0].clone(), sqrt(q.clone()));
              b = new Symbol(1);
            }
          }
          //simplify factorial but only if
          //1 - It's division so b will have a negative power
          //2 - We're not dealing with factorials of numbers
          else if (
            a.fname === FACTORIAL &&
            b.fname === FACTORIAL &&
            !u.isConstant() &&
            !v.isConstant() &&
            b.power < 0
          ) {
            //assume that n = positive
            var d = _.subtract(u.clone(), v.clone());

            //if it's not numeric then we don't know if we can simplify so just return
            if (d.isConstant()) {
              //there will never be a case where d == 0 since this will already have
              //been handled at the beginning of this function
              t = new Symbol(1);
              if (d < 0) {
                //If d is negative then the numerator is larger so expand that
                for (var i = 0, n = Math.abs(d); i <= n; i++) {
                  var s = _.add(u.clone(), new Symbol(i));
                  t = _.multiply(t, s);
                }

                result = _.multiply(
                  _.pow(u, new Symbol(a.power)),
                  _.pow(t, new Symbol(b.power)),
                );

                b = new Symbol(1);
              } else {
                //Otherwise the denominator is larger so expand that
                for (var i = 0, n = Math.abs(d); i <= n; i++) {
                  var s = _.add(v.clone(), new Symbol(i));
                  t = _.multiply(t, s);
                }

                result = _.multiply(
                  _.pow(t, new Symbol(a.power)),
                  _.pow(v, new Symbol(b.power)),
                );

                b = new Symbol(1);
              }
            }
          }
        }

        //if both are PL then their hashes have to match
        if (v1 === v2 && g1 === PL && g1 === g2) {
          v1 = a.text("hash");
          v2 = b.text("hash");
        }

        //same issue with (x^2+1)^x*(x^2+1)
        //EX needs an exception when multiplying because it needs to recognize
        //that (x+x^2)^x has the same hash as (x+x^2). The latter is kept as x
        if (g2 === EX && b.previousGroup === PL && g1 === PL) {
          v1 = text(a, "hash", EX);
        }

        if (
          (v1 === v2 || ONN) &&
          !(g1 === PL && (g2 === S || g2 === P || g2 === FN)) &&
          !(g1 === PL && g2 === CB)
        ) {
          var p1 = a.power,
            p2 = b.power,
            isSymbolP1 = isSymbol(p1),
            isSymbolP2 = isSymbol(p2),
            toEX = isSymbolP1 || isSymbolP2;
          //TODO: this needs cleaning up
          if (
            g1 === PL &&
            g2 !== PL &&
            b.previousGroup !== PL &&
            p1.equals(1)
          ) {
            result = new Symbol(0);
            a.each(function (x) {
              result = _.add(result, _.multiply(x, b.clone()));
            }, true);
          } else {
            //add the powers
            result.power = toEX
              ? _.add(
                  !isSymbol(p1) ? new Symbol(p1) : p1,
                  !isSymbol(p2) ? new Symbol(p2) : p2,
                )
              : g1 === N /*don't add powers for N*/
                ? p1
                : p1.add(p2);

            //eliminate zero power values and convert them to numbers
            if (result.power.equals(0)) result = result.convert(N);

            //properly convert to EX
            if (toEX) result.convert(EX);

            //take care of imaginaries
            if (a.imaginary && b.imaginary) {
              var isEven = even(result.power % 2);
              if (isEven) {
                result = new Symbol(1);
                m.negate();
              }
            }

            //cleanup: this causes the LaTeX generator to get confused as to how to render the symbol
            if (result.group !== EX && result.previousGroup)
              result.previousGroup = undefined;
            //the sign for b is floating around. Remember we are assuming that the odd variable will carry
            //the sign but this isn't true if they're equals symbols
            result.multiplier = result.multiplier.multiply(b.multiplier);
          }
        } else if (g1 === CB && a.isLinear()) {
          if (g2 === CB) b.distributeExponent();
          if (g2 === CB && b.isLinear()) {
            for (var s in b.symbols) {
              var x = b.symbols[s];
              result = result.combine(x);
            }
            result.multiplier = result.multiplier.multiply(b.multiplier);
          } else {
            result.combine(b);
          }
        } else {
          //the multiplier was already handled so nothing left to do
          if (g1 !== N) {
            if (g1 === CB) {
              result.distributeExponent();
              result.combine(b);
            } else if (!b.isOne()) {
              var bm = b.multiplier.clone();
              b.toUnitMultiplier();
              result = Symbol.shell(CB).combine([result, b]);
              //transfer the multiplier to the outside
              result.multiplier = result.multiplier.multiply(bm);
            }
          } else {
            result = b.clone().toUnitMultiplier(true);
          }
        }

        if (result.group === P) {
          var logV = Math.log(result.value),
            n1 = Math.log(bnum) / logV,
            n2 = Math.log(bden) / logV,
            ndiv = m.num / bnum,
            ddiv = m.den / bden;
          //we don't want to divide by zero no do we? Strange things happen.
          if (n1 !== 0 && isInt(n1) && isInt(ndiv)) {
            result.power = result.power.add(new Frac(n1));
            m.num /= bnum; //BigInt? Keep that in mind for the future.
          }
          if (n2 !== 0 && isInt(n2) && isInt(ddiv)) {
            result.power = result.power.subtract(new Frac(n2));
            m.den /= bden; //BigInt? Keep that in mind for the future.
          }
        }

        //unpack CB if length is only one
        if (result.length === 1) {
          var t = result.multiplier;
          //transfer the multiplier
          result = firstObject(result.symbols);
          result.multiplier = result.multiplier.multiply(t);
        }

        //reduce square root
        var ps = result.power.toString();
        if (even(ps) && result.fname === SQRT) {
          //grab the sign of the symbol
          sign = sign * result.sign();
          var p = result.power;
          result = result.args[0];
          result = _.multiply(
            new Symbol(m),
            _.pow(result, new Symbol(p.divide(new Frac(2)))),
          );
          //flip it back to the correct sign
          if (sign < 0) result.negate();
        } else {
          result.multiplier = result.multiplier.multiply(m).multiply(sign);
          if (result.group === CP && result.isImaginary())
            result.distributeMultiplier();
        }

        //back convert group P to a simpler group N if possible
        if (result.group === P && isInt(result.power.toDecimal()))
          result = result.convert(N);

        return result;
      } else {
        //****** Matrices & Vector *****//
        if (bIsSymbol && !aIsSymbol) {
          //keep symbols to the right
          t = a;
          a = b;
          b = t; //swap
          t = bIsSymbol;
          bIsSymbol = aIsSymbol;
          aIsSymbol = t;
        }

        var isMatrixB = isMatrix(b),
          isMatrixA = isMatrix(a);
        if (aIsSymbol && isMatrixB) {
          var M = new Matrix();
          b.eachElement(function (e, i, j) {
            M.set(i, j, _.multiply(a.clone(), e));
          });

          b = M;
        } else {
          if (isMatrixA && isMatrixB) {
            b = a.multiply(b);
          } else if (aIsSymbol && isVector(b)) {
            b.each(function (x, i) {
              i--;
              b.elements[i] = _.multiply(a.clone(), b.elements[i]);
            });
          } else {
            if (isVector(a) && isVector(b)) {
              b.each(function (x, i) {
                i--;
                b.elements[i] = _.multiply(a.elements[i], b.elements[i]);
              });
            } else if (isVector(a) && isMatrix(b)) {
              //try to convert a to a matrix
              return this.multiply(b, a);
            } else if (isMatrix(a) && isVector(b)) {
              if (b.elements.length === a.rows()) {
                var M = new Matrix(),
                  l = a.cols();
                b.each(function (e, i) {
                  var row = [];
                  for (var j = 0; j < l; j++) {
                    row.push(
                      _.multiply(a.elements[i - 1][j].clone(), e.clone()),
                    );
                  }
                  M.elements.push(row);
                });
                return M;
              } else err("Dimensions must match!");
            }
          }
        }

        return b;
      }
    };
    /**
     * Gets called when the parser finds the / operator. See this.add
     * @param {Symbol} a
     * @param {Symbol} b
     * @returns {Symbol}
     */
    this.divide = function (a, b) {
      var aIsSymbol = isSymbol(a),
        bIsSymbol = isSymbol(b);

      if (aIsSymbol && bIsSymbol) {
        //forward to Unit division
        if (a.unit || b.unit) {
          return _.Unit.divide(a, b);
        }
        var result;
        if (b.equals(0))
          throw new DivisionByZero("Division by zero not allowed!");

        if (a.isConstant() && b.isConstant()) {
          result = a.clone();
          result.multiplier = result.multiplier.divide(b.multiplier);
        } else {
          b.invert();
          result = _.multiply(a, b);
        }
        return result;
      } else {
        //******* Vectors & Matrices *********//
        var isVectorA = isVector(a),
          isVectorB = isVector(b);
        if (aIsSymbol && isVectorB) {
          b = b.map(function (x) {
            return _.divide(a.clone(), x);
          });
        } else if (isVectorA && bIsSymbol) {
          b = a.map(function (x) {
            return _.divide(x, b.clone());
          });
        } else if (isVectorA && isVectorB) {
          if (a.dimensions() === b.dimensions()) {
            b = b.map(function (x, i) {
              return _.divide(a.elements[--i], x);
            });
          } else _.error("Cannot divide vectors. Dimensions do not match!");
        } else {
          var isMatrixA = isMatrix(a),
            isMatrixB = isMatrix(b);
          if (isMatrixA && bIsSymbol) {
            var M = new Matrix();
            a.eachElement(function (x, i, j) {
              M.set(i, j, _.divide(x, b.clone()));
            });
            b = M;
          } else if (aIsSymbol && isMatrixB) {
            var M = new Matrix();
            b.eachElement(function (x, i, j) {
              M.set(i, j, _.divide(a.clone(), x));
            });
            b = M;
          } else if (isMatrixA && isMatrixB) {
            var M = new Matrix();
            if (a.rows() === b.rows() && a.cols() === b.cols()) {
              a.eachElement(function (x, i, j) {
                M.set(i, j, _.divide(x, b.elements[i][j]));
              });
              b = M;
            } else {
              _.error("Dimensions do not match!");
            }
          } else if (isMatrixA && isVectorB) {
            if (a.cols() === b.dimensions()) {
              var M = new Matrix();
              a.eachElement(function (x, i, j) {
                M.set(i, j, _.divide(x, b.elements[i].clone()));
              });
              b = M;
            } else {
              _.error("Unable to divide matrix by vector.");
            }
          }
        }
        return b;
      }
    };
    /**
     * Gets called when the parser finds the ^ operator. See this.add
     * @param {Symbol} a
     * @param {Symbol} b
     * @returns {Symbol}
     */
    this.pow = function (a, b) {
      var aIsSymbol = isSymbol(a),
        bIsSymbol = isSymbol(b);
      if (aIsSymbol && bIsSymbol) {
        //it has units then it's the Unit module's problem
        if (a.unit || b.unit) {
          return _.Unit.pow(a, b);
        }

        // Handle abs
        if (a.group === FN && a.fname === ABS && even(b)) {
          var m = a.multiplier.clone();
          var raised = _.pow(a.args[0], b);
          raised.multiplier = m;
          return raised;
        }

        // Handle infinity
        if (a.isInfinity || b.isInfinity) {
          if (a.isInfinity && b.isInfinity)
            throw new UndefinedError("(" + a + ")^(" + b + ") is undefined!");

          if (a.isConstant() && b.isInfinity) {
            if (a.equals(0)) {
              if (b.lessThan(0))
                throw new UndefinedError("0^Infinity is undefined!");
              return new Symbol(0);
            }
            if (a.equals(1))
              throw new UndefinedError("1^" + b.toString() + " is undefined!");
            //a^-oo
            if (b.lessThan(0)) return new Symbol(0);
            //a^oo
            if (!a.lessThan(0)) return Symbol.infinity();
          }

          if (a.isInfinity && b.isConstant()) {
            if (b.equals(0)) throw new UndefinedError(a + "^0 is undefined!");
            if (b.lessThan(0)) return new Symbol(0);
            return _.multiply(
              Symbol.infinity(),
              _.pow(new Symbol(a.sign()), b.clone()),
            );
          }
        }

        var aIsZero = a.equals(0);
        var bIsZero = b.equals(0);
        if (aIsZero && bIsZero) throw new UndefinedError("0^0 is undefined!");

        // Return 0 right away if possible
        if (aIsZero && b.isConstant() && b.multiplier.greaterThan(0))
          return new Symbol(0);

        if (bIsZero) return new Symbol(1);

        var bIsConstant = b.isConstant(),
          aIsConstant = a.isConstant(),
          bIsInt = b.isInteger(),
          m = a.multiplier,
          result = a.clone();

        // 0^0, 1/0, etc. Complain.
        if (aIsConstant && bIsConstant && a.equals(0) && b.lessThan(0))
          throw new UndefinedError("Division by zero is not allowed!");

        // Compute imaginary numbers right away
        if (
          Settings.PARSE2NUMBER &&
          aIsConstant &&
          bIsConstant &&
          a.sign() < 0 &&
          evenFraction(b)
        ) {
          var k, re, im;
          k = Math.PI * b;
          re = new Symbol(Math.cos(k));
          im = _.multiply(Symbol.imaginary(), new Symbol(Math.sin(k)));
          return _.add(re, im);
        }

        // Imaginary number under negative nthroot or to the n
        if (
          Settings.PARSE2NUMBER &&
          a.isImaginary() &&
          bIsConstant &&
          isInt(b) &&
          !b.lessThan(0)
        ) {
          var re, im, r, theta, nre, nim, phi;
          re = a.realpart();
          im = a.imagpart();
          if (re.isConstant("all") && im.isConstant("all")) {
            phi = Settings.USE_BIG
              ? Symbol(
                  bigDec
                    .atan2(i.multiplier.toDecimal(), r.multiplier.toDecimal())
                    .times(b.toString()),
                )
              : Math.atan2(im, re) * b;
            theta = new Symbol(phi);
            r = _.pow(Symbol.hyp(re, im), b);
            nre = _.multiply(r.clone(), _.trig.cos(theta.clone()));
            nim = _.multiply(r, _.trig.sin(theta));
            return _.add(nre, _.multiply(Symbol.imaginary(), nim));
          }
        }

        // Take care of the symbolic part
        result.toUnitMultiplier();
        //simpifly sqrt
        if (result.group === FN && result.fname === SQRT && !bIsConstant) {
          var s = result.args[0];
          s.multiplyPower(new Symbol(0.5));
          s.multiplier.multiply(result.multiplier);
          s.multiplyPower(b);
          result = s;
        } else {
          var sign = m.sign();
          //handle cases such as (-a^3)^(1/4)
          if (evenFraction(b) && sign < 0) {
            // Swaperoo
            // First put the sign back on the symbol
            result.negate();
            // Wrap it in brackets
            result = _.symfunction(PARENTHESIS, [result]);
            // Move the sign back the exterior and let nerdamer handle the rest
            result.negate();
          }

          result.multiplyPower(b);
        }

        if (aIsConstant && bIsConstant && Settings.PARSE2NUMBER) {
          var c;
          //remove the sign
          if (sign < 0) {
            a.negate();
            if (b.multiplier.den.equals(2))
              //we know that the numerator has to be odd and therefore it's i
              c = new Symbol(Settings.IMAGINARY);
            else if (isInt(b.multiplier)) {
              if (even(b.multiplier)) c = new Symbol(1);
              else c = new Symbol(-1);
            } else if (!even(b.multiplier.den)) {
              c = new Symbol(Math.pow(sign, b.multiplier.num));
            } else {
              c = _.pow(
                _.symfunction(PARENTHESIS, [new Symbol(sign)]),
                b.clone(),
              );
            }
          }

          const _pow = Math.pow(
            a.multiplier.toDecimal(),
            b.multiplier.toDecimal(),
          );
          if (_pow !== 0 || a.multiplier.equals(0)) {
            result = new Symbol(_pow);
          } else {
            // should not be here, must have underflowed precision
            const ad = new bigDec(a.multiplier.toDecimal());
            const bd = new bigDec(b.multiplier.toDecimal());
            result = new Symbol(ad.pow(bd).toFixed());
          }
          //put the back sign
          if (c) result = _.multiply(result, c);
        } else if (bIsInt && !m.equals(1)) {
          var abs_b = b.abs();
          // Provide fall back to JS until big number implementation is improved
          if (abs_b.gt(Settings.MAX_EXP)) {
            if (b.sign() < 0) return new Symbol(0);
            return Symbol.infinity();
          } else {
            var p = b.multiplier.toDecimal();
            var sgn = Math.sign(p);
            p = Math.abs(p);
            var multiplier = new Frac(1);
            multiplier.num = m.num.pow(p);
            multiplier.den = m.den.pow(p);
            if (sgn < 0) multiplier.invert();
            //multiplying is justified since after mulltiplyPower if it was of group P it will now be of group N
            result.multiplier = result.multiplier.multiply(multiplier);
          }
        } else {
          var sign = a.sign();
          if (
            b.isConstant() &&
            a.isConstant() &&
            !b.multiplier.den.equals(1) &&
            sign < 0
          ) {
            //we know the sign is negative so if the denominator for b == 2 then it's i
            if (b.multiplier.den.equals(2)) {
              var i = new Symbol(Settings.IMAGINARY);
              a.negate(); //remove the sign
              //if the power is negative then i is negative
              if (b.lessThan(0)) {
                i.negate();
                b.negate(); //remove the sign from the power
              }
              //pull the power normally and put back the imaginary
              result = _.multiply(_.pow(a, b), i);
            } else {
              var aa = a.clone();
              aa.multiplier.negate();
              result = _.pow(
                _.symfunction(PARENTHESIS, [new Symbol(sign)]),
                b.clone(),
              );
              var _a = _.pow(new Symbol(aa.multiplier.num), b.clone());
              var _b = _.pow(new Symbol(aa.multiplier.den), b.clone());
              var r = _.divide(_a, _b);
              result = _.multiply(result, r);
            }
          } else if (Settings.PARSE2NUMBER && b.isImaginary()) {
            //4^(i + 2) = e^(- (2 - 4 i) π n + (2 + i) log(4))

            var re = b.realpart();
            var im = b.imagpart();
            /*
                         if(b.group === CP && false) {
                         var ex = _.pow(a.clone(), re);
                         var xi = _.multiply(_.multiply(ex.clone(), trig.sin(im.clone())), Symbol.imaginary());
                         var xa = _.multiply(trig.cos(im), ex);
                         result = _.add(xi, xa);
                         }
                         else {
                         */
            var aa = a.clone().toLinear();
            var a1 = _.pow(aa.clone(), re);
            var log_a = log(aa.clone());
            var b1 = trig.cos(_.multiply(im.clone(), log_a));
            var c1 = _.multiply(
              trig.sin(_.multiply(im, log(aa))),
              Symbol.imaginary(),
            );
            result = _.multiply(a1, _.add(b1, c1));
            result = _.expand(_.parse(result));
            /*
                         }   
                         */
          } else {
            //b is a symbol
            var neg_num = a.group === N && sign < 0,
              num = testSQRT(
                new Symbol(neg_num ? m.num : Math.abs(m.num)).setPower(
                  b.clone(),
                ),
              ),
              den = testSQRT(new Symbol(m.den).setPower(b.clone()).invert());

            //eliminate imaginary if possible
            if (a.imaginary) {
              if (bIsInt) {
                var s, p, n;
                s = Math.sign(b);
                p = abs(b);
                n = p % 4;
                result = new Symbol(even(n) ? -1 : Settings.IMAGINARY);
                if (n === 0 || (s < 0 && n === 1) || (s > 0 && n === 3)) {
                  result.negate();
                }
              } else {
                //assume i = sqrt(-1) -> (-1)^(1/2)
                var nr = b.multiplier.multiply(Frac.quick(1, 2)),
                  //the denominator denotes the power so raise to it. It will turn positive it round
                  tn = Math.pow(-1, nr.num);
                result = even(nr.den)
                  ? new Symbol(-1).setPower(nr, true)
                  : new Symbol(tn);
              }
            }
            //ensure that the sign is carried by the symbol and not the multiplier
            //this enables us to check down the line if the multiplier can indeed be transferred
            if (sign < 0 && !neg_num) result.negate();

            //retain the absolute value
            if (bIsConstant && a.group !== EX) {
              var evenr = even(b.multiplier.den),
                evenp = even(a.power),
                n = result.power.toDecimal(),
                evennp = even(n);
              if (evenr && evenp && !evennp) {
                if (n === "1" || n === 1) {
                  // check for together.math baseunits
                  // don't have to wrap them in abs()
                  if (
                    typeof result.value !== "string" ||
                    !result.value.startsWith("baseunit_")
                  ) {
                    result = _.symfunction(ABS, [result]);
                  }
                } else if (!isInt(n)) {
                  var p = result.power;
                  result = _.symfunction(ABS, [result.toLinear()]).setPower(p);
                } else {
                  result = _.multiply(
                    _.symfunction(ABS, [result.clone().toLinear()]),
                    result.clone().setPower(new Frac(n - 1)),
                  );
                }
                //quick workaround. Revisit
                if (Settings.POSITIVE_MULTIPLIERS && result.fname === ABS)
                  result = result.args[0];
              }
            }
            //multiply out sqrt
            if (b.equals(2) && result.group === CB) {
              var _result = new Symbol(1);
              result.each(function (sym) {
                _result = _.multiply(_result, _.pow(sym, b));
              });
              result = _result;
            }
          }
        }

        result = testSQRT(result);

        // Don't multiply until we've tested the remaining symbol
        if (num && den) {
          result = _.multiply(result, testPow(_.multiply(num, den)));
        }

        // Reduce square root
        if (result.fname === SQRT) {
          var isEX = result.group === EX;
          var t = isEX
            ? result.power.multiplier.toString()
            : result.power.toString();
          if (even(t)) {
            var pt = isEX
                ? _.divide(result.power, new Symbol(2))
                : new Symbol(result.power.divide(new Frac(2))),
              m = result.multiplier;
            result = _.pow(result.args[0], pt);
            result.multiplier = result.multiplier.multiply(m);
          }
        }
        // Detect Euler's identity
        else if (
          !Settings.IGNORE_E &&
          result.isE() &&
          result.group === EX &&
          result.power.contains("pi") &&
          result.power.contains(Settings.IMAGINARY) &&
          b.group === CB
        ) {
          var theta = b.stripVar(Settings.IMAGINARY);
          result = _.add(
            trig.cos(theta),
            _.multiply(Symbol.imaginary(), trig.sin(theta)),
          );
        }

        return result;
      } else {
        if (isVector(a) && bIsSymbol) {
          a = a.map(function (x) {
            return _.pow(x, b.clone());
          });
        } else if (isMatrix(a) && bIsSymbol) {
          var M = new Matrix();
          a.eachElement(function (x, i, j) {
            M.set(i, j, _.pow(x, b.clone()));
          });
          a = M;
        } else if (aIsSymbol && isMatrix(b)) {
          var M = new Matrix();
          b.eachElement(function (x, i, j) {
            M.set(i, j, _.pow(a.clone(), x));
          });
          a = M;
        }
        return a;
      }
    };
    // Gets called when the parser finds the , operator.
    // Commas return a Collector object which is roughly an array
    this.comma = function (a, b) {
      if (!(a instanceof Collection)) a = Collection.create(a);
      a.append(b);
      return a;
    };
    // Link to modulus
    this.mod = function (a, b) {
      return mod(a, b);
    };
    // Used to slice elements from arrays
    this.slice = function (a, b) {
      return new Slice(a, b);
    };
    // The equality setter
    this.equals = function (a, b) {
      // Equality can only be set for group S so complain it's not
      if (a.group !== S && !a.isLinear())
        err("Cannot set equality for " + a.toString());
      VARS[a.value] = b.clone();
      return b;
    };
    // Percent
    this.percent = function (a) {
      return _.divide(a, new Symbol(100));
    };
    // Set variable
    this.assign = function (a, b) {
      if (a instanceof Collection && b instanceof Collection) {
        a.elements.map(function (x, i) {
          return _.assign(x, b.elements[i]);
        });
        return Vector.fromArray(b.elements);
      }
      if (a.parent) {
        // It's referring to the parent instead. The current item can be discarded
        var e = a.parent;
        e.elements[e.getter] = b;
        delete e.getter;
        return e;
      }

      if (a.group !== S)
        throw new NerdamerValueError(
          "Cannot complete operation. Incorrect LH value for " + a,
        );
      VARS[a.value] = b;
      return b;
    };
    this.function_assign = function (a, b) {
      var f = a.elements.pop();
      return setFunction(f, a.elements, b);
    };
    // Function to quickly convert bools to Symbols
    var bool2Symbol = function (x) {
      return new Symbol(x === true ? 1 : 0);
    };
    //check for equality
    this.eq = function (a, b) {
      return bool2Symbol(a.equals(b));
    };
    //checks for greater than
    this.gt = function (a, b) {
      return bool2Symbol(a.gt(b));
    };
    //checks for greater than equal
    this.gte = function (a, b) {
      return bool2Symbol(a.gte(b));
    };
    //checks for less than
    this.lt = function (a, b) {
      return bool2Symbol(a.lt(b));
    };
    //checks for less than equal
    this.lte = function (a, b) {
      return bool2Symbol(a.lte(b));
    };
    // wraps the factorial
    this.factorial = function (a) {
      return this.symfunction(FACTORIAL, [a]);
    };
    // wraps the double factorial
    this.dfactorial = function (a) {
      return this.symfunction(DOUBLEFACTORIAL, [a]);
    };
  }