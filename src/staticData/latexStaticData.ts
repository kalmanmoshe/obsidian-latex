import { BracketState, BracketType } from './encasings';




export interface LatexMetadata {
    type: LatexType;
    name: string;
    latex: string;
    references: string[];
}

type DeepPartial<T> = {
    [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

enum LatexType {
    Number = 'number',
    Syntax = 'syntax',
    Unit= 'unit',
    Path = 'path',
    Macro='macro',
    Formatting = 'formatting',
    PathConnector='pathConnector',
    Bracket='bracket'
}

const partialBrackets:DeepPartial<LatexMetadata>[] = [
    // Parentheses
    { type: LatexType.Bracket, name: BracketType.Parentheses + '_' + BracketState.Open, references: ["("]},
    { type: LatexType.Bracket, name: BracketType.Parentheses + '_' + BracketState.Close, references: [")"]},
    { type: LatexType.Bracket, name: BracketType.CurlyBraces + '_' + BracketState.Open, references: ["{"]},
    { type: LatexType.Bracket, name: BracketType.CurlyBraces + '_' + BracketState.Close, references: ["}"]},
    { type: LatexType.Bracket, name: BracketType.SquareBrackets + '_' + BracketState.Open, references: ["["]},
    { type: LatexType.Bracket, name: BracketType.SquareBrackets + '_' + BracketState.Close, references: ["]"]},
];
export const brackets=partialBrackets.map(b=>createLatexMetadata(b))


const tikzMacros:DeepPartial<LatexMetadata>[] = [
    { type: LatexType.Macro, name: 'Definition', references: ['\\def'] },
];

const tikzFormatting:DeepPartial<LatexMetadata>[] = [
    { type: LatexType.Formatting, name: 'LineWidth', references: ['line width'] },
    { type: LatexType.Formatting, name: 'Label', references: ['label'] },
    { type: LatexType.Formatting, name: 'Large', references: ['\\Large'] },
    { type: LatexType.Formatting, name: 'Color', references: ['red'] },
    { type: LatexType.Formatting, name: 'Opacity', references: ['opacity'] },
];


const tikzUnits:DeepPartial<LatexMetadata>[] = [
    { type: LatexType.Unit, name: 'Point', references: ['pt'] },
    { type: LatexType.Unit, name: 'Centimeter', references: ['cm'] },
];

const tikzPathAndNodes:DeepPartial<LatexMetadata>[] = [
    { type: LatexType.Path, name: 'Draw', references: ['\\draw'] },
    { type: LatexType.Path, name: 'Coordinate', references: ['\\coordinate'] },
];

const tikzPathConnectors:DeepPartial<LatexMetadata>[] = [
    { type: LatexType.PathConnector, name: 'ReferenceLastAxis', latex: '--++', references: ['--++'] },
    { type: LatexType.PathConnector, name: 'ReferenceFirstAxis', latex: '--+', references: ['--+'] },
    { type: LatexType.PathConnector, name: 'AxisConnector', latex: '--', references: ['--'] },
];
const tikzSyntax:DeepPartial<LatexMetadata>[] = [
    { name: 'colon',references: [','] },
    { name: 'semicolon',references: [';'] },
    { name: 'equals',references: ['='] },
];

const tikzComponents = [
    ...brackets,
    ...tikzFormatting,
    ...tikzUnits,
    ...tikzPathAndNodes,
    ...tikzPathConnectors,
    ...tikzMacros,
    ...tikzSyntax,
];

export const units = [
    { type: 'Unit', references: ['pt', 'cm', ',', ';', '-'] },
];

const tikzColors=[
    
]

export const LatexMetadata=tikzComponents.map(c=>createLatexMetadata(c))

export function createLatexMetadata(overrides: DeepPartial<LatexMetadata>): LatexMetadata {
    const givenReferences = overrides?.references?.filter((ref) => typeof ref === 'string') || [];
    const defaultReferences: string[] = givenReferences.length > 0 ? givenReferences : [];
    const latex = overrides.latex || defaultReferences[0] || '';

    return {
        type: overrides.type ?? LatexType.Syntax,
        name: overrides.name ?? 'Unknown',  
        latex: latex,
        references: [...defaultReferences],
    };
}
