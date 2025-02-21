
import { BracketType } from './encasings';
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
    { key: "ף", code: "Semicolon", replacement: ";" },
    { key: "/", code: "KeyQ", replacement: "q" },
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





export const greekLetters = [
    'Alpha','alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta', 'Theta', 
    'Iota', 'Kappa', 'Lambda', 'Mu','mu', 'Nu', 'Xi', 'Omicron', 'Pi', 'Rho', 
    'Sigma', 'Tau', 'Upsilon', 'Phi', 'Chi', 'Psi', 'Omega'
];

const mathConstants = new Map<string, number>([
    ['pi', Math.PI],
    ['e', Math.E],
    ['goldenRatio', (1 + Math.sqrt(5)) / 2],
    ['sqrt2', Math.SQRT2],
    ['sqrt1_2', Math.SQRT1_2],
    ['ln2', Math.LN2],
    ['ln10', Math.LN10],
    ['log2e', Math.LOG2E],
    ['log10e', Math.LOG10E],
]);

  

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


export enum associativityFormatType{
    Latex,
    MathJax,
}

export interface MathJaxOperatorMetadata {
    type: OperatorType;
    name: string;
    references: string[];
    priority: number;
    associativity: Associativity
}

type Associativity = Map<associativityFormatType,{
    string: string;
    backslash: boolean;
    numPositions: number;
    commutative: boolean;
    ranges: { min: number; max: number };
    positions: Map<number, {
        bracketType: BracketType;
        isBracketOptional: boolean;
    }>;
}>;

export type AssociativityValue = Associativity extends Map<any, infer V> ? V : never;
export type Positions=AssociativityValue['positions'];
export type PositionValue = Positions extends Map<any, infer V> ? V : never;


type DeepPartial<T> = {
    [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export function createMathJaxOperatorMetadata(
    overrides: DeepPartial<MathJaxOperatorMetadata>
): MathJaxOperatorMetadata {
    const references = overrides.references?.filter((ref): ref is string => ref !== undefined) || [];
    const associativity = createMathJaxAssociativityMetadataFromPartial(
        (overrides.associativity as [associativityFormatType, Partial<AssociativityValue>][] ?? [])
    );
    const associativityFormatTypeString = [...new Set([...associativity.entries()].map(([_, value]) => value.string))];
    return {
        type: overrides.type ?? OperatorType.Arithmetic,
        name: overrides.name ?? 'Unknown',
        references: [...associativityFormatTypeString, ...references],
        priority: overrides.priority ?? 0,
        associativity
    };
}



function createMathJaxAssociativityMetadataFromPartial(
    overrides?: [associativityFormatType, Partial<AssociativityValue>][]
): Associativity {

    const overridesMap=new Map(overrides)

    const map = new Map<associativityFormatType, AssociativityValue>();

    const formatTypes = Object.keys(associativityFormatType)
    
    for (const format of formatTypes) {
        const key = associativityFormatType[format as keyof typeof associativityFormatType];
        let value= overridesMap.get(key) || [...overridesMap.values()].find(v => v !== undefined);
        map.set(key,createMathJaxAssociativityValue(value));
    }
    return map;
}


function createMathJaxAssociativityValue(overrides: Partial<AssociativityValue> = {}): AssociativityValue {
    function calculateDifference(max: number, min: number): number {
        return max === min ? 1 : Math.abs(max - min) + (min > 0 ? 1 : 0);
    }

    const providedPositions = new Map(overrides.positions);

    // Safely get numeric keys, handling empty or missing values
    const numericKeys = Array.from(providedPositions.keys())
    
    const [minKey,maxKey] = [Math.min(...numericKeys),Math.max(...numericKeys)];


    // Ensure positions are continuous, considering exceptions for 0
    const expectedLength = calculateDifference(maxKey, minKey);
    if (numericKeys.length !== expectedLength) {
        throw new Error(
            `Associativity positions must be continuous (except for 0). Missing keys, off by: ${expectedLength - numericKeys.length}`
        );
    }

    // Create the `positions` map with default values when necessary
    const positions = new Map<number, { bracketType: BracketType; isBracketOptional: boolean }>();

    for (const key of numericKeys) {
        const provided = providedPositions.get(key);
        positions.set(key, {
            bracketType: provided?.bracketType ?? BracketType.None,
            isBracketOptional: provided?.isBracketOptional ?? false,
        });
    }


        return {
            string: overrides.string ?? '',
            backslash: overrides.backslash ?? false,
            numPositions: overrides.numPositions ?? positions.size,
            commutative: overrides.commutative ?? false,
            ranges: overrides.ranges ?? { min: minKey, max: maxKey },
            positions
        };
}













const partialMathJaxOperatorsMetadata: DeepPartial<MathJaxOperatorMetadata>[]=[
    {
        type: OperatorType.Comparison,
        name: 'Equals',
        references: ['='],
        priority: 6,
        associativity: [
            [associativityFormatType.MathJax,
                {
                    string  : '=',
                    positions: [[-1,{}], [1,{}]]
                }
            ],
        ]
    },
    {
        type: OperatorType.Comparison,
        name: 'LessThan',
        references: ['<'],
        priority: 6,
        associativity: [
            [associativityFormatType.MathJax,
                {
                    string  : '<',
                    positions: [[-1,{}], [1,{}]]
                }
            ],
        ]
    },
    {
        type: OperatorType.Comparison,
        name: 'GreaterThan',
        references: ['>'],
        priority: 6,
        associativity: [
            [associativityFormatType.MathJax,
                {
                    string  : '>',
                    positions: [[-1,{}], [1,{}]]
                }
            ],
        ]
    },
    /* Arithmetic */
    {
        type: OperatorType.Arithmetic,
        name: 'Addition',
        references: ['+'],
        priority: 4,
        associativity: [
            [associativityFormatType.MathJax,
                {
                    string  : '+',
                    positions: [[-1,{}], [1,{}]]
                }
            ],
        ]
    },
    {
        type: OperatorType.Arithmetic,
        name: 'Subtraction',
        references: ['-'],
        priority: 4,
        associativity: [
            [associativityFormatType.MathJax,
                {
                    string  : '-',
                    positions: [[-1,{}], [1,{}]]
                }
            ],
        ]
    },
    {
        type: OperatorType.Arithmetic,
        name: 'Multiplication',
        references: ['*'],
        priority: 3,
        associativity: [
            [associativityFormatType.MathJax,
                {
                    string  : 'cdot',
                    backslash: true,
                    positions: [[-1,{bracketType: BracketType.Parentheses,isBracketOptional: true}], [1,{bracketType: BracketType.Parentheses,isBracketOptional: true}]]
                }
            ],
        ]
    },
    /* Trigonometric */
    {
        type: OperatorType.Trigonometric,
        name: 'Sine',
        priority: 2,
        associativity: [
            [associativityFormatType.MathJax,
                {
                    string  : 'sin',
                    backslash: true,
                    positions: [[1,{bracketType: BracketType.Parentheses }]]
                }
            ],
        ]
    },
    {
        type: OperatorType.Trigonometric,
        name: 'Cosine',
        priority: 2,
        associativity: [
            [associativityFormatType.MathJax,
                {
                    string  : 'cos',
                    backslash: true,
                    positions: [[1,{bracketType: BracketType.Parentheses }]]
                }
            ],
        ]
    },
    {
        type: OperatorType.Trigonometric,
        name: 'Tangent',
        priority: 2,
        associativity: [
            [associativityFormatType.MathJax,
                {
                    string  : 'tan',
                    backslash: true,
                    positions: [[1,{bracketType: BracketType.Parentheses }]]
                }
            ],
        ]
    },
    /* Exponential */
    {
        type: OperatorType.Exponential,
        name: 'Power',
        references: ['^'],
        priority: 1,
        associativity: [
            [associativityFormatType.MathJax,
                {
                    string  : '^',
                    positions: [[-1,{ bracketType: BracketType.Parentheses,isBracketOptional: true }],[1,{ bracketType: BracketType.CurlyBraces}]]
                }
            ],
            [associativityFormatType.Latex,
                {
                    string  : '^',
                    positions: [[-1,{ bracketType: BracketType.Parentheses,isBracketOptional: true }],[1,{ bracketType: BracketType.Parentheses,isBracketOptional: true }]]
                }
            ],
        ]
    },
    {
        type: OperatorType.Exponential,
        name: 'Exponent',
        references: ['e^', '\\exp'],
        priority: 1,
        associativity: [
            [associativityFormatType.MathJax,
                {
                    string  : 'e^',
                    positions: [[1,{bracketType: BracketType.Parentheses }]]
                }
            ],
        ]
    },
    /* Logarithmic */
    /* Fraction */
    {
        type: OperatorType.Fraction,
        name: 'Fraction',
        priority: 1,
        associativity: [
            [associativityFormatType.MathJax,
                {
                    string  : 'frac',
                    backslash: true,
                    positions: [[1,{bracketType: BracketType.CurlyBraces }],[2,{bracketType: BracketType.CurlyBraces }]]
                }
            ],
        ]
    },
    /* Radical */
    {
        type: OperatorType.Radical,
        name: 'SquareRoot',
        priority: 1,
        associativity: [
            [associativityFormatType.MathJax,
                {
                    string  : 'sqrt',
                    backslash: true,
                    positions: [[1,{bracketType: BracketType.CurlyBraces }]]
                }
            ],
        ]
    },
];


export const mathJaxOperatorsMetadata: MathJaxOperatorMetadata[] = partialMathJaxOperatorsMetadata.map(
    (metadata) => createMathJaxOperatorMetadata(metadata)
);