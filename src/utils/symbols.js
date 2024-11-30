import { arrToRegexString, regExp } from "src/tikzjax/tikzjax";

export function searchSymbols(query) {
    const combinedData = [...latexOperators, ...symbolTranslator,...Brackets];
    return combinedData.find(item =>
        Object.values(item).some(value => 
            typeof value === 'string' && value.includes(query)
        )
    );
}


export function searchOperators(query) {
    return latexOperators.find(item =>
        Object.values(item).flat().some((value) =>
            typeof value === 'string' &&value?.includes(query),
        )
    );
}


const escapeForRegex = (string) => {
    return string.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
};

export function getAllLatexReferences() {
    return [...latexOperators,...Brackets]
        .map(operator => operator.references || []) 
        .flat()
        .map(escapeForRegex);
}

export function getAllOperatorReferences() {
    return latexOperators
        .map(operator => operator.references || []) 
        .flat()
        .map(escapeForRegex);
}

export function getOperatorsByPriority(priorityLevel,toRegex) {
    const prioritized=latexOperators
    .filter(operator => operator.priority === priorityLevel)
    .map(operator => operator.name);
    return toRegex?regExp(prioritized):prioritized;
}
export function getOperatorsBySides(side) {
    const sides=latexOperators
    .filter(operator => operator.associativity === side)
    .map(operator => operator.name);
    return sides;
}
export function getOperatorsByBracket(bracket) {
    const brackets=latexOperators
    .filter(operator => operator.bracket === bracket)
    .map(operator => operator.name);
    return brackets;
}

export function hasImplicitMultiplication(operatorName) {
    const operator = latexOperators.find(op => op.name === operatorName);
    if (!operator) {return false;}
    return operatorsWithImplicitMultiplication.includes(operator.type);
}


const operatorsWithImplicitMultiplication = [
    'Radical', 'Integral', 'Trigonometric', 'Logarithmic','Fraction','Radical'
]
//'Radical', 'Integral', 'Trigonometric', 'Logarithmic', 'Exponential'

const latexOperators = [
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
        name: 'Less Than',
        latex: '<',
        references: ['<'],
        priority: 6,
        associativity: 'both',
        bracket: 'none',
    },
    {
        type: 'Comparison',
        name: 'Greater Than',
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
        name: 'Natural Logarithm',
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
        name: 'Square Root',
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

const symbolTranslator = [
    { 
        type: 'greek-letter',
        name: 'Pi', 
        latex: '\\pi', 
        unicode: '\u03C0', 
        text: 'π' 
    },
    {
        type: 'greek-letter',
        name: 'Alpha', 
        latex: '\\alpha', 
        unicode: '\u03B1', 
        text: 'α' 
    },
    {
        
        name: 'Infinity', 
        latex: '\\infty', 
        unicode: '\u221E', 
        text: '∞'
    },
    
];

const Brackets = [
    {
        name: "Parentheses-open",
        references: ["("],
        Unicode: "\u0028"
    },
    {
        name: "Parentheses-close",
        references: [")"],
        Unicode: "\u0029"
    },
    {
        name: "Curly Brackets-open",
        references: ["{"],
        Unicode: "\u007B"
    },
    {
        name: "Curly Brackets-close",
        references: ["}"],
        Unicode: "\u007D"
    },
    {
        name: "Square Brackets-open",
        references: ["["],
        Unicode: "\u005B"
    },
    {
        name: "Square Brackets-close",
        references: ["]"],
        Unicode: "\u005D"
    },
    {
        name: "Angle Brackets-open",
        references: ["<"],
        Unicode: "\u003C"
    },
    {
        name: "Angle Brackets-close",
        references: [">"],
        Unicode: "\u003E"
    },
    {
        name: "Double Angle Brackets-open",
        references: ["《"],
        Unicode: "\u300A"
    },
    {
        name: "Double Angle Brackets-close",
        references: ["》"],
        Unicode: "\u300B"
    },
    {
        name: "Single Angle Brackets-open",
        references: ["〈"],
        Unicode: "\u3008"
    },
    {
        name: "Single Angle Brackets-close",
        references: ["〉"],
        Unicode: "\u3009"
    },
    {
        name: "White Square Brackets-open",
        references: ["〖"],
        Unicode: "\u301A"
    },
    {
        name: "White Square Brackets-close",
        references: ["〗"],
        Unicode: "\u301B"
    },
    {
        name: "Tortoise Shell Brackets-open",
        references: ["〔"],
        Unicode: "\u3014"
    },
    {
        name: "Tortoise Shell Brackets-close",
        references: ["〕"],
        Unicode: "\u3015"
    }
];
