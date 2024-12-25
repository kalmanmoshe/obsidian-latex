

export const  keyboardAutoReplaceHebrewToEnglishTriggers =
[
    { key: "\u05D0", code: "KeyT", replacement: "t" },
    { key: "\u05D1", code: "KeyC", replacement: "c" },
    { key: "\u05D2", code: "KeyD", replacement: "d" },
    { key: "\u05D3", code: "KeyS", replacement: "s" },
    { key: "\u05D4", code: "KeyV", replacement: "v" },
    { key: "\u05D5", code: "KeyU", replacement: "u" },
    { key: "\u05D6", code: "KeyZ", replacement: "z" },
    { key: "\u05D7", code: "KeyJ", replacement: "j" },
    { key: "\u05D8", code: "KeyY", replacement: "y" },
    { key: "ך", code: "KeyL", replacement: "l" },
    { key: "\u05D9", code: "KeyH", replacement: "h" },
    { key: "\u05DB", code: "KeyF", replacement: "f" },
    { key: "\u05DC", code: "KeyK", replacement: "k" },
    { key: "\u05DE", code: "KeyN", replacement: "n" },
    { key: "\u05DD", code: "KeyO", replacement: "o" },
    { key: "\u05E0", code: "KeyB", replacement: "b" },
    { key: "\u05DF", code: "KeyI", replacement: "i" },
    { key: "\u05E1", code: "KeyX", replacement: "x" },
    { key: "\u05E2", code: "KeyG", replacement: "g" },
    { key: "\u05E4", code: "KeyP", replacement: "p" },
    { key: "\u05E6", code: "KeyM", replacement: "m" },
    { key: "\u05E8", code: "KeyR", replacement: "r" },
    { key: "\u05E7", code: "KeyE", replacement: "e" },
    { key: "\u05E9", code: "KeyA", replacement: "a" },
    { key: "\u05EA", code: "KeyC", replacement: "c" },
    { key: "ת", code: "Comma", replacement: "," },
    { key: "'", code: "KeyW", replacement: "w" },
    { key: "\u05E5", code: "Period", replacement: "." },
    { key: ".", code: "Slash", replacement: "/" },
    { key: "]", code: "BracketLeft", replacement: "[" },
    { key: "[", code: "BracketRight", replacement: "]" },
    { key: "}", code: "BracketLeft", replacement: "{" },
    { key: "{", code: "BracketRight", replacement: "}" },
    { key: ")", code: "Digit9", replacement: "(" },
    { key: "(", code: "Digit0", replacement: ")" },
    { key: ">", code: "Comma", replacement: "<" },
    { key: "<", code: "Period", replacement: ">" }
];




export const tikzSyntax = [
    { type: 'Syntax', name: 'Equals', references: ['='] },
    { type: 'Syntax', name: 'Comma', references: [','] },
    { type: 'Syntax', name: 'Hashtag', references: ['#'] },
    { type: 'Syntax', name: 'Colon', references: [':'] },
    { type: 'Syntax', name: 'Semicolon', references: [';'] },
    { type: 'Syntax', name: 'Dash', references: ['-'] },
    { type: 'Syntax', name: 'Plus', references: ['+'] }
  ];
export const tikzMacros=[
    { type: 'Macro', name: 'Definition', references: ['\\def'] },
]
export const tikzFormatting = [
    { type: 'Formatting', name: 'LineWidth', references: ['line width'] },
    { type: 'Formatting', name: 'Label', references: ['label'] },
    { type: 'Formatting', name: 'Large', references: ['\\Large'] },
    { type: 'Formatting', name: 'Color', value: 'red', references: ['red'] },
    { type: 'Formatting', name: 'Opacity', references: ['opacity'] }
  ];
  
export const tikzUnits = [
    { type: 'Unit', name: 'Point', references: ['pt'] },
    { type: 'Unit', name: 'Centimeter', references: ['cm'] }
  ];
  
export const tikzPathAndNodes = [
    { type: 'Path', name: 'Draw', references: ['\\draw'] },
    { type: 'Node', name: 'Coordinate', references: ['\\coordinate'] }
  ];
  
export const tikzPathConnectors = [
    { type: 'PathConnector', name: 'ReferenceLastAxis', latex: '--++', references: ['--++'] },
    { type: 'PathConnector', name: 'ReferenceFirstAxis', latex: '--+', references: ['--+'] },
    { type: 'PathConnector', name: 'AxisConnector', latex: '--', references: ['--'] }
  ];

export const brackets = [
    { type: 'Bracket', name: "Parentheses_open", references: ["("],},
    { type: 'Bracket', name: "Parentheses_close", references: [")"],},
    { type: 'Bracket', name: "Curly_brackets_open", references: ["{"],},
    { type: 'Bracket', name: "Curly_brackets_close", references: ["}"],},
    { type: 'Bracket', name: "Square_brackets_open", references: ["["],},
    { type: 'Bracket', name: "Square_brackets_close", references: ["]"],},
    { type: 'Bracket', name: "Angle Brackets_open", references: ["<"],},
    { type: 'Bracket', name: "Angle Brackets_close", references: [">"],}
];

export const tikzComponents=[
    ...tikzSyntax,...tikzFormatting,...tikzUnits,...tikzPathAndNodes,...tikzPathConnectors,...tikzMacros,...brackets
]
  
export const units=[
    {
        references: ['pt','cm',',',';','-'],
    },
]



  

export const operatorsWithImplicitMultiplication = [
    'Radical', 'Integral', 'Trigonometric', 'Logarithmic','Fraction','Radical'
]
//'Radical', 'Integral', 'Trigonometric', 'Logarithmic', 'Exponential'

export const mathJaxOperators = [
    /* Comparison */
    {
        type: 'Comparison',
        name: 'Equals', 
        latex: '=',
        references: ['='],
        priority: 6, 
        associativity: 'both',
        bracket: 'none',
    },
    {
        type: 'Comparison',
        name: 'Less than',
        latex: '<',
        references: ['<'],
        priority: 6,
        associativity: 'both',
        bracket: 'none',
    },
    {
        type: 'Comparison',
        name: 'Greater than',
        latex: '>',
        references: ['>'],
        priority: 6,
        associativity: 'both',
        bracket: 'none',
    },
    /* Arithmetic */
    {
        type: 'Arithmetic',
        name: 'Plus',
        latex: '+',
        references: ['+'],
        priority: 4,
        associativity: 'both',
        bracket: 'none',
    },
    {
        type: 'Arithmetic',
        name: 'Minus',
        latex: '-',
        references: ['-'],
        priority: 4,
        associativity: 'both',
        bracket: 'none',
    },
    {
        type: 'Arithmetic',
        name: 'Multiplication',
        latex: '\\cdot',
        references: ['\\cdot','cdot', '*',],
        priority: 3,
        associativity: 'both',
        bracket: 'none',
    },
    {
        type: 'Arithmetic',
        name: 'Division',
        latex: '\\div',
        references: ['\\div', '/'],
        priority: 3,
        associativity: 'both',
        bracket: 'none',
    },
    /* Trigonometric */
    {
        type: 'Trigonometric',
        name: 'Sin',
        latex: '\\sin',
        references: ['sin', '\\sin'],
        priority: 2,
        associativity: 'right',
        bracket: 'none',
    },
    {
        type: 'Trigonometric',
        name: 'Cos',
        latex: '\\cos',
        references: ['cos', '\\cos'],
        priority: 2,
        associativity: 'right',
        bracket: 'none',
    },
    {
        type: 'Trigonometric',
        name: 'Tan',
        latex: '\\tan',
        references: ['tan', '\\tan'],
        priority: 2,
        associativity: 'right',
        bracket: 'none',
    },
    /* Exponential */
    {
        type: 'Exponential',
        name: 'Pow',
        latex: '^',
        references: ['^'],
        priority: 1,
        associativity: 'both',
        bracket: 'right',
    },
    {
        type: 'Exponential',
        name: 'Exponential',
        latex: 'e^',
        references: ['e^', '\\exp'],
        priority: 1,
        associativity: 'right',
        bracket: 'none',
    },
    /* Logarithmic */
    {
        type: 'Logarithmic',
        name: 'Log',
        latex: '\\log',
        references: ['log', '\\log'],
        priority: 2,
        associativity: 'right',
        bracket: 'none',
    },
    {
        type: 'Logarithmic',
        name: 'Natural logarithm',
        latex: '\\ln',
        references: ['ln', '\\ln'],
        priority: 2,
        associativity: 'right',
        bracket: 'none',
    },
    /* Fraction */
    {
        type: 'Fraction',
        name: 'Fraction',
        latex: '\\frac',
        references: ['\\frac','frac'],
        priority: 1,
        associativity: 'doubleRight',
        bracket: 'doubleRight',
    },
    /* Radical */
    {
        type: 'Radical',
        name: 'Square root',
        latex: '\\sqrt',
        references: ['sqrt', '\\sqrt'],
        priority: 1,
        associativity: 'right',
        bracket: 'right',
    },
    /* Integral */
    {
        type: 'Integral',
        name: 'Integral',
        latex: '\\int',
        references: ['\\int', 'integral'],
        priority: 5,
        associativity: 'right',
        bracket: 'none',
    },
    /* Summation */
    {
        type: 'Summation',
        name: 'Summation',
        latex: '\\sum',
        references: ['\\sum', 'summation'],
        priority: 5,
        associativity: 'right',
        bracket: 'none',
    },
    /* Factorial */
    {
        type: 'Factorial',
        name: 'Factorial',
        latex: '!',
        references: ['!'],
        priority: 1,
        associativity: 'right',
        bracket: 'none',
    }
];
