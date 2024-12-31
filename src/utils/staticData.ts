import { createHash } from "crypto";


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



  




export enum OperatorType {
    Comparison = 'Comparison',
    Arithmetic = 'Arithmetic',
    Trigonometric = 'Trigonometric',
    Exponential = 'Exponential',
    Logarithmic = 'Logarithmic',
    Fraction = 'Fraction',
    Radical = 'Radical',
    Integral = 'Integral',
    Summation = 'Summation',
    Factorial = 'Factorial',
}

export const operatorNames = new Map<OperatorType, string[]>([
    [OperatorType.Comparison, ['Equals', 'LessThan', 'GreaterThan']],
    [OperatorType.Arithmetic, ['Addition', 'Subtraction', 'Multiplication', 'Division']],
    [OperatorType.Trigonometric, ['Sine', 'Cosine', 'Tangent', 'Secant', 'Cosecant', 'Cotangent']],
    [OperatorType.Exponential, ['Exponent', 'Power']],
    [OperatorType.Logarithmic, []],
    [OperatorType.Fraction, ['Fraction']],
    [OperatorType.Radical, ['SquareRoot','NthRoot']],
    [OperatorType.Integral, ['Definite']],
    [OperatorType.Summation, []],
    [OperatorType.Factorial, ['Factorial']],
]);

//'Radical', 'Integral', 'Trigonometric', 'Logarithmic', 'Exponential'
export const operatorsWithImplicitMultiplication = [
    OperatorType.Radical,OperatorType.Integral,OperatorType.Trigonometric,OperatorType.Logarithmic,OperatorType.Factorial,OperatorType.Fraction
]


export enum Associativity {
    Right = 'right',
    Left = 'left',
    DoubleRight = 'doubleRight',
}

export enum BracketType {
    Parentheses = 'parentheses',
    SquareBracket = 'squareBracket',
    CurlyBraces = 'curlyBracket',
    None = 'none',
}

export interface MathJaxOperatorMetadata {
    type: OperatorType;
    name: string;
    latex: string;
    backslash: boolean;
    references: string[];
    priority: number;
    associativity: {
        numPositions: number;
        ranges: { min: number; max: number };
        positions: Map<number, {
            bracketType: BracketType;
            isBracketOptional: boolean;
        }>;
    };
}


type DeepPartial<T> = {
    [P in keyof T]?: T[P] extends Map<number, infer V>
        ? Record<number, DeepPartial<V>>
        : T[P] extends object
        ? DeepPartial<T[P]>
        : T[P];
};



export function createMathJaxOperatorMetadata(
    overrides: DeepPartial<MathJaxOperatorMetadata>
): MathJaxOperatorMetadata {
    function calculateDifference(max: number, min: number): number {
        return max === min ? 1 : Math.abs(max - min) + (min > 0 ? 1 : 0);
    }
    
    const providedPositions =
        overrides.associativity?.positions instanceof Map
            ? overrides.associativity.positions
            : objectToMap(overrides.associativity?.positions);

    // Extract numeric keys and determine the range
    const numericKeys = Array.from(providedPositions.keys());
    const minKey = Math.min(...numericKeys);
    const maxKey = Math.max(...numericKeys);

    if (!isFinite(minKey) || !isFinite(maxKey)) {
        throw new Error("No valid numeric keys found for associativity positions.");
    }
    if (numericKeys.length !== calculateDifference(maxKey, minKey)) {
        throw new Error(`Associativity positions must be continuous (except for 0) missing Keys found, off by: ${calculateDifference(maxKey, minKey)-numericKeys.length}`);
    }
    const positions = new Map<number, { bracketType: BracketType,isBracketOptional: boolean }>();
    for (const key of numericKeys) {
        const provided = providedPositions.get(key);
        positions.set(key, {
            bracketType: provided?.bracketType ?? BracketType.None,
            isBracketOptional: provided?.isBracketOptional ?? false,
        });
    }

    const references =overrides.references?.filter((ref): ref is string => ref !== undefined) || []

    return {
        type: overrides.type ?? OperatorType.Arithmetic,
        name: overrides.name ?? 'Unknown',
        latex: overrides.latex ?? references[0] ?? '',
        backslash: overrides.backslash ?? false,
        references: [...createReferencesFromlatex(overrides.latex),...references],
        priority: overrides.priority ?? 0,
        associativity: {
            numPositions: positions.size,
            ranges: (overrides?.associativity?.ranges ?? { min: minKey, max: maxKey }) as { min: number; max: number },
            positions,
        },
    };
}

function createReferencesFromlatex(latex?: string):string[]{
    const arr: string[]=[];
    if(!latex)return arr;
    arr.push(latex)
    if(latexCommand(latex))arr.push(`\\${latex}`)
    return arr;
}
const latexCommand= (str: string) => /^[a-zA-Z]+$/.test(str);

function stringLatex(latex: string){
    return latexCommand(latex)?`\\${latex}\s`:latex
}



function objectToMap<T>(obj?: Record<number | string, T>): Map<number, T> {
    if (!obj) return new Map();
    return new Map(
        Object.entries(obj).map(([key, value]) => [parseInt(key, 10), value])
    );
}







const partialMathJaxOperatorsMetadata: DeepPartial<MathJaxOperatorMetadata>[]=[
    {
        type: OperatorType.Comparison,
        name: 'Equals',
        latex: '=',
        references: ['='],
        priority: 6,
        associativity: {
            positions: {
                '-1': {},
                '1': {},
            },
        },
    },
    {
        type: OperatorType.Comparison,
        name: 'LessThan',
        latex: '<',
        references: ['<'],
        priority: 6,
        associativity: {
            positions: {
                '-1': {},
                '1': {},
            },
        },
    },
    {
        type: OperatorType.Comparison,
        name: 'GreaterThan',
        latex: '>',
        references: ['>'],
        priority: 6,
        associativity: { 
            positions: {
                '-1': {},
                '1': {},
            },
        },
    },
    /* Arithmetic */
    {
        type: OperatorType.Arithmetic,
        name: 'Addition',
        latex: '+',
        references: ['+'],
        priority: 4,
        associativity: {
            positions: {
                '-1': {},
                '1': {},
            },
        },
    },
    {
        type: OperatorType.Arithmetic,
        name: 'Subtraction',
        latex: '-',
        references: ['-'],
        priority: 4,
        associativity: {
            positions: {
                '-1': {},
                '1': {},
            },
        },
    },
    {
        type: OperatorType.Arithmetic,
        name: 'Multiplication',
        latex: 'cdot',
        references: ['*'],
        priority: 3,
        associativity: {
            positions: {
                '-1': {bracketType: BracketType.Parentheses,isBracketOptional: true},
                '1': {bracketType: BracketType.Parentheses,isBracketOptional: true},
            },
        },
    },
    {
        type: OperatorType.Arithmetic,
        name: 'Division',
        latex: 'div',
        references: ['/'],
        priority: 3,
        associativity: {
            positions: {
                '-1': {},
                '1': {},
            },
        },
    },
    /* Trigonometric */
    {
        type: OperatorType.Trigonometric,
        name: 'Sine',
        latex: 'sin',
        priority: 2,
        associativity: {
            positions: {
                '1': { bracketType: BracketType.Parentheses },
            },
        },
    },
    {
        type: OperatorType.Trigonometric,
        name: 'Cosine',
        latex: 'cos',
        priority: 2,
        associativity: {
            positions: {
                '1': { bracketType: BracketType.Parentheses },
            },
        },
    },
    {
        type: OperatorType.Trigonometric,
        name: 'Tangent',
        latex: 'tan',
        priority: 2,
        associativity: {
            positions: {
                '1': { bracketType: BracketType.Parentheses },
            },
        },
    },
    /* Exponential */
    {
        type: OperatorType.Exponential,
        name: 'Power',
        latex: '^',
        references: ['^'],
        priority: 1,
        associativity: {
            positions: {
                '-1': { bracketType: BracketType.Parentheses,isBracketOptional: true },
                '1': { bracketType: BracketType.CurlyBraces },
            },
        },
    },
    {
        type: OperatorType.Exponential,
        name: 'Exponent',
        latex: 'e^',
        references: ['e^', '\\exp'],
        priority: 1,
        associativity: {
            positions: {
                '1': { bracketType: BracketType.Parentheses },
            },
        },
    },
    /* Logarithmic */
    /* Fraction */
    {
        type: OperatorType.Fraction,
        name: 'Fraction',
        latex: 'frac',
        priority: 1,
        associativity: {
            positions: {
                '1': { bracketType: BracketType.CurlyBraces },
                '2': { bracketType: BracketType.CurlyBraces },
            },
        },
    },
    /* Radical */
    {
        type: OperatorType.Radical,
        name: 'SquareRoot',
        latex: 'sqrt',
        priority: 1,
        associativity: {
            positions: {
                '1': {  bracketType: BracketType.CurlyBraces },
            },
        },
    },
    /* Integral */
    {
        type: OperatorType.Integral,
        name: 'Integral',
        latex: '\\int',
        references: ['\\int', 'integral'],
        priority: 5,
        associativity: {
            positions: {
                '1': {},
            },
        },
    },
    /* Summation */
    /* Factorial */
    {
        type: OperatorType.Factorial,
        name: 'Factorial',
        latex: '!',
        references: ['!'],
        priority: 1,
        associativity: {
            positions: {
                '1': {},
            },
        },
    },
];


export const mathJaxOperatorsMetadata: MathJaxOperatorMetadata[] = partialMathJaxOperatorsMetadata.map(
    (metadata) => createMathJaxOperatorMetadata(metadata)
);