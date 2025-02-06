const Settings = {
    //Enables/Disables call peekers. False means callPeekers are disabled and true means callPeekers are enabled.
    callPeekers: false,

    //the max number up to which to cache primes. Making this too high causes performance issues
    init_primes: 1000,

    exclude: [],
    //If you don't care about division by zero for example then this can be set to true.
    //Has some nasty side effects so choose carefully.
    suppress_errors: false,
    //the global used to invoke the libary to parse to a number. Normally cos(9) for example returns
    //cos(9) for convenience but parse to number will always try to return a number if set to true.
    PARSE2NUMBER: false,
    //this flag forces the a clone to be returned when add, subtract, etc... is called
    SAFE: false,
    //the symbol to use for imaginary symbols
    IMAGINARY: 'i',
    //the modules used to link numeric function holders
    FUNCTION_MODULES: [Math],
    //Allow certain characters
    ALLOW_CHARS: ['π'],
    //Allow nerdamer to convert multi-character variables
    USE_MULTICHARACTER_VARS: true,
    //Allow changing of power operator
    POWER_OPERATOR: '^',
    // Function catch regex
    FUNCTION_REGEX: /^\s*([a-z_][a-z0-9_]*)\(([a-z0-9_,\s]*)\)\s*:?=\s*(.+)\s*$/i,
    //The variable validation regex
    //VALIDATION_REGEX: /^[a-z_][a-z\d\_]*$/i
    VALIDATION_REGEX: /^[a-z_αAβBγΓδΔϵEζZηHθΘιIκKλΛμMνNξΞoOπΠρPσΣτTυϒϕΦχXψΨωΩ∞][0-9a-z_αAβBγΓδΔϵEζZηHθΘιIκKλΛμMνNξΞoOπΠρPσΣτTυϒϕΦχXψΨωΩ]*$/i,
    // The regex used to determine which characters should be included in implied multiplication
    IMPLIED_MULTIPLICATION_REGEX: /([\+\-\/\*]*[0-9]+)([a-z_αAβBγΓδΔϵEζZηHθΘιIκKλΛμMνNξΞoOπΠρPσΣτTυϒϕΦχXψΨωΩ]+[\+\-\/\*]*)/gi,
    //Aliases
    ALIASES: {
        'π': 'pi',
        '∞': 'Infinity'
    },
    POSITIVE_MULTIPLIERS: false,
    //Cached items
    CACHE: {},
    //Print out warnings or not
    SILENCE_WARNINGS: false,
    // Precision
    PRECISION: 21,
    // The Expression defaults to this value for decimal places
    EXPRESSION_DECP: 19,
    // The text function defaults to this value for decimal places
    DEFAULT_DECP: 16,
    //function mappings
    VECTOR: 'vector',
    PARENTHESIS: 'parens',
    SQRT: 'sqrt',
    ABS: 'abs',
    FACTORIAL: 'factorial',
    DOUBLEFACTORIAL: 'dfactorial',
    //reference pi and e
    LONG_PI: '3.14159265358979323846264338327950288419716939937510582097494459230781640628620899862803482534211706798214' +
            '808651328230664709384460955058223172535940812848111745028410270193852110555964462294895493038196',
    LONG_E: '2.718281828459045235360287471352662497757247093699959574966967627724076630353547594571382178525166427427466' +
            '39193200305992181741359662904357290033429526059563073813232862794349076323382988075319525101901',
    PI: Math.PI,
    E: Math.E,
    LOG: 'log',
    LOG10: 'log10',
    LOG10_LATEX: 'log_{10}',
    MAX_EXP: 200000,
    //The number of scientific place to round to
    SCIENTIFIC_MAX_DECIMAL_PLACES: 14,
    //True if ints should not be converted to
    SCIENTIFIC_IGNORE_ZERO_EXPONENTS: true,
    // no simplify() or solveFor() should take more ms than this
    TIMEOUT: 500,
};


class nerdamer{
    
    version = '1.1.16';
    _ = new Parser();

    //import bigInt
    bigInt = imports.bigInt;
    bigDec = imports.bigDec;

    bigDec.set({precision: 250});

    Groups = {};

    PRIMES = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79, 83, 89, 97, 101, 103, 107, 109, 113
                , 127, 131, 137, 139, 149, 151, 157, 163, 167, 173, 179, 181, 191, 193, 197, 199, 211, 223, 227, 229, 233, 239, 241, 251,
        257, 263, 269, 271, 277, 281, 283, 293, 307, 311, 313, 317, 331, 337, 347, 349, 353, 359, 367, 373, 379, 383, 389, 397,
        401, 409, 419, 421, 431, 433, 439, 443, 449, 457, 461, 463, 467, 479, 487, 491, 499, 503, 509, 521, 523, 541, 547, 557,
        563, 569, 571, 577, 587, 593, 599, 601, 607, 613, 617, 619, 631, 641, 643, 647, 653, 659, 661, 673, 677, 683, 691, 701,
        709, 719, 727, 733, 739, 743, 751, 757, 761, 769, 773, 787, 797, 809, 811, 821, 823, 827, 829, 839, 853, 857, 859, 863,
        877, 881, 883, 887, 907, 911, 919, 929, 937, 941, 947, 953, 967, 971, 977, 983, 991, 997, 1009, 1013, 1019, 1021, 1031,
        1033, 1039, 1049, 1051, 1061, 1063, 1069, 1087, 1091, 1093, 1097, 1103, 1109, 1117, 1123, 1129, 1151, 1153, 1163, 1171,
        1181, 1187, 1193, 1201, 1213, 1217, 1223, 1229, 1231, 1237, 1249, 1259, 1277, 1279, 1283, 1289, 1291, 1297, 1301, 1303,
        1307, 1319, 1321, 1327, 1361, 1367, 1373, 1381, 1399, 1409, 1423, 1427, 1429, 1433, 1439, 1447, 1451, 1453, 1459, 1471,
        1481, 1483, 1487, 1489, 1493, 1499, 1511, 1523, 1531, 1543, 1549, 1553, 1559, 1567, 1571, 1579, 1583, 1597, 1601, 1607,
        1609, 1613, 1619, 1621, 1627, 1637, 1657, 1663, 1667, 1669, 1693, 1697, 1699, 1709, 1721, 1723, 1733, 1741, 1747, 1753,
        1759, 1777, 1783, 1787, 1789, 1801, 1811, 1823, 1831, 1847, 1861, 1867, 1871, 1873, 1877, 1879, 1889, 1901, 1907, 1913, 1931,
        1933, 1949, 1951, 1973, 1979, 1987, 1993, 1997, 1999, 2003, 2011, 2017, 2027, 2029, 2039, 2053, 2063, 2069, 2081, 2083];

    CUSTOM_OPERATORS = {};

}