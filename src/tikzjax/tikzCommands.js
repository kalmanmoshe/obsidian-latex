import { arrToRegexString, regExp } from "src/tikzjax/tikzjax";
import { escapeForRegex } from "src/utils/symbols";


export function getAllTikzReferences() {
    return [...tikzCommands,...Brackets,...units]
        .map(operator => operator.references || []) 
        .flat()
        .map(escapeForRegex);
}

export function searchTizkCommands(query){
    return [...tikzCommands,...Brackets,...units]
    .find(item =>
        Object.values(item).flat().some((value) =>
            typeof value === 'string' &&value === query,
        )
    );
}
export function searchTizkForOgLatex(query){
    return [...tikzCommands,...Brackets,...units]
    .find(item =>
        item.name===query
    );
}


//Remember name syntax for commas exc


const tikzCommands = [
    /* Comparison */
    {
        type: 'Syntax',
        name: 'Equals', 
        references: ['='],
    },
    {
        type: 'Path',
        name: 'Draw', 
        references: ['\\draw'],
    },
    {
        type: 'Formatting',
        name: 'LineWidth', 
        references: ['line width'],
    },
    {
        type: 'Unit',
        name: 'Point',
        references: ['pt'],
    },
    {
        type: 'Unit',
        name: 'Centimeter',
        references: ['cm'],
    },
    {
        type: 'Syntax',
        name: 'Comma',
        references: [','],
    },
    {
        type: 'Syntax',
        name: 'Semicolon',
        references: [';'],
    },
    {
        type: 'Syntax',
        name: 'Dash',
        references: ['-'],
    },
    {
        type: 'Syntax',
        name: 'Plus',
        references: ['+'],
    },
    {
        type: 'PathConnector',
        name: 'ReferenceLastAxis',
        latex: '--++',
        references: ['--++'],
    },
    {
        type: 'PathConnector',
        name: 'ReferenceFirstAxis',
        latex: '--+',
        references: ['--+'],
    },
    {
        type: 'PathConnector',
        name: 'AxisConnecter',
        latex: '--',
        references: ['--'],
    },
    {
        type: 'Formatting',
        name: 'Color',
        value: 'red',
        references: ['red'],
    },
];

const units=[
    {
        references: ['pt','cm',',',';','-'],
    },
]

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
        type: 'Bracket',
        name: "Parentheses_open",
        references: ["("],
        Unicode: "\u0028"
    },
    {
        type: 'Bracket',
        name: "Parentheses_close",
        references: [")"],
        Unicode: "\u0029"
    },
    {
        type: 'Bracket',
        name: "Curly_brackets_open",
        references: ["{"],
        Unicode: "\u007B"
    },
    {
        type: 'Bracket',
        name: "Curly_brackets_close",
        references: ["}"],
        Unicode: "\u007D"
    },
    {
        type: 'Bracket',
        name: "Square_brackets_open",
        references: ["["],
        Unicode: "\u005B"
    },
    {
        type: 'Bracket',
        name: "Square_brackets_close",
        references: ["]"],
        Unicode: "\u005D"
    },
    {
        type: 'Bracket',
        name: "Angle Brackets-open",
        references: ["<"],
        Unicode: "\u003C"
    },
    {
        type: 'Bracket',
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
