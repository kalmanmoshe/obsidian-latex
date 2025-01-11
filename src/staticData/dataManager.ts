import { regExp } from "src/tikzjax/tikzjax";
import { Associativity, BracketType, MathJaxOperatorMetadata, mathJaxOperatorsMetadata, operatorsWithImplicitMultiplication,OperatorType, operatorNames } from "./mathParserStaticData";
import { brackets, LatexMetadata } from "./latexStaticData";

/**
 * Escapes a string for safe use in a regular expression.
 * @param {string} str - The string to escape.
 * @returns {string} - The escaped string.
 */
export const escapeForRegex = (str: string): string => {
    return str.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
};

/**
 * Retrieves all TikZ components as an array of regex-ready strings.
 * @returns {string[]} - Array of escaped TikZ component references.
 */
export function getAllTikzReferences() {
    return LatexMetadata
        .flatMap((component: LatexMetadata) => component.references || [])
        .map(escapeForRegex);
}

/**
 * Searches TikZ components for a specific query.
 * @param {string} query - The query to search for.
 * @returns {object | undefined} - The matched TikZ component or undefined if not found.
 */
export function searchTikzComponents(query: string) {
    return LatexMetadata.find((component: LatexMetadata) =>
        Object.values(component).flat().some((value) =>
            typeof value === 'string' && value === query
        )
    );
}

/**
 * Searches symbols (math operators and brackets) for a specific query.
 * @param {string} query - The query to search for.
 * @returns {object | undefined} - The matched symbol or undefined if not found.
 */
export function searchSymbols(query: string) {
    return [...mathJaxOperatorsMetadata, ...brackets].find((symbol) =>
        Object.values(symbol).some((value) =>
            typeof value === 'string' && value.includes(query)
        )
    );
}

/**
 * Searches math operators for a specific query.
 * @param {string} query - The query to search for.
 * @returns {object | undefined} - The matched operator or undefined if not found.
 */
export function searchMathJaxOperators(query: string) {
    return mathJaxOperatorsMetadata.find((operator) =>
        Object.values(operator).flat().some((value) =>
            typeof value === 'string' && value.includes(query)
        )
    );
}
export function getAllMathJaxReferences() {
    return [...mathJaxOperatorsMetadata, ...brackets]
        .flatMap((component) => component.references || [])
        .map(escapeForRegex);
}
/**
 * Retrieves all MathJax operators and brackets as regex-ready strings.
 * @returns {string[]} - Array of escaped MathJax operator and bracket references.
 */
export function searchAllMathJaxOperatorsAndSymbols(query: string) {
    return [...mathJaxOperatorsMetadata, ...brackets]
    .find((operator) =>
        Object.values(operator).flat().some((value) =>
            typeof value === 'string' && value.includes(query)
        ))
}

/**
 * Retrieves MathJax operators by priority level.
 * @param {number} priorityLevel - The priority level to filter by.
 * @param {boolean} toRegex - Whether to return the results as regex.
 * @returns {string[] | RegExp[]} - Array of operator names or regex patterns.
 */
export function getMathJaxOperatorsByPriority(priorityLevel: number, toRegex = false) {
    const prioritized = mathJaxOperatorsMetadata
        .filter((operator) => operator.priority === priorityLevel)
        .map((operator) => operator.name);
    return toRegex ? regExp(prioritized) : prioritized;
}

/**
 * Checks if an operator has implicit multiplication.
 * @param {string} operatorName - The name of the operator to check.
 * @returns {boolean} - True if the operator has implicit multiplication, false otherwise.
 */

export function hasImplicitMultiplication(operatorName: string) {
    const operator = mathJaxOperatorsMetadata.find((op) => op.name === operatorName);
    return operator ? getOperatorNamesByType(operatorsWithImplicitMultiplication).includes(operator.type) : false;
}

function getOperatorNamesByType(operatorTypes: OperatorType|OperatorType[]){
    if(!Array.isArray(operatorTypes)){
        operatorTypes=[operatorTypes]
    }
    return operatorTypes.map(type=> operatorNames.get(type)).flat();
}



/**
 * The following functions.or helper functions to retrieve the static data based on.parentheses.brackets and sidies 
 * inside the staticData.ts file.
 */





/**
 * Retrieves operators by associativity (side).
 * @param {Associativity} side - The associativity side to filter by (e.g., 'left', 'right', 'doubleRight').
 * @returns {string[]} - Array of operator names matching the specified side.
 */
export function getOperatorsByAssociativity(side: number|number[]): string[] {
    if(side instanceof Array){
        return side.flatMap((s) => getOperatorsByAssociativity(s));
    }
    return mathJaxOperatorsMetadata
        .filter((operator) => operator.associativity.positions.has(side))
        .map((operator) => operator.name);
}

/**
 * Retrieves operators by bracket type.
 * @param {BracketType} bracket - The bracket type to filter by (e.g., 'parentheses', 'none').
 * @param {Associativity} side - The side to check for the specified bracket type.
 * @returns {string[]} - Array of operator names matching the specified bracket type and side.
 */
export function getOperatorsByBracketType(
    bracket: BracketType,
    side: number
): string[] {
    return mathJaxOperatorsMetadata
        .filter(
            (operator) =>
                operator.associativity.positions.get(side)?.bracketType === bracket
        )
        .map((operator) => operator.name);
}

/**
 * Checks if a value matches any operator with the specified associativities.
 * @param {string} value - The value to check.
 * @param {Associativity[]} sides - The associativity sides to check (e.g., ['left', 'right']).
 * @returns {boolean} - True if the value matches any operator with the specified associativities.
 */

export function isOperatorWithAssociativity(value: string, sides: number[], absolute?: boolean): boolean {
    const operators = sides.map((side) => getOperatorsByAssociativity(side).includes(value));
    return absolute ? operators.every((operator) => operator) : operators.some((operator) => operator);
}

/**
 * Checks if a value matches any operator with the specified associativities.
 * @param {string} value - The value to check.
 * @param {Associativity[]} sides - The associativity sides to check (e.g., ['left', 'right']).
 * @returns {boolean} - True if the value matches any operator with the specified associativities.
 */
export function getValuesWithKeysBySide<T>(map: Map<number, T>, left: boolean): T[] {
    return Array.from(map.entries())
        .filter(([key]) => left ? key < 0 : key > 0)
        .map(([, value]) => value);
}



