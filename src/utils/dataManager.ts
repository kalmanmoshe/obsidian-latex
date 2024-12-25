import { regExp } from "src/tikzjax/tikzjax";
import { brackets, mathJaxOperators, operatorsWithImplicitMultiplication, tikzComponents, units } from "./staticData";

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
    return tikzComponents
        .flatMap((component) => component.references || [])
        .map(escapeForRegex);
}

/**
 * Searches TikZ components for a specific query.
 * @param {string} query - The query to search for.
 * @returns {object | undefined} - The matched TikZ component or undefined if not found.
 */
export function searchTikzComponents(query: string) {
    return tikzComponents.find((component) =>
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
    return [...mathJaxOperators, ...brackets].find((symbol) =>
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
    return mathJaxOperators.find((operator) =>
        Object.values(operator).flat().some((value) =>
            typeof value === 'string' && value.includes(query)
        )
    );
}
export function getAllMathJaxReferences() {
    return [...mathJaxOperators, ...brackets]
        .flatMap((component) => component.references || [])
        .map(escapeForRegex);
}
/**
 * Retrieves all MathJax operators and brackets as regex-ready strings.
 * @returns {string[]} - Array of escaped MathJax operator and bracket references.
 */
export function searchAllMathJaxOperatorsAndSymbols(query: string) {
    return [...mathJaxOperators, ...brackets]
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
    const prioritized = mathJaxOperators
        .filter((operator) => operator.priority === priorityLevel)
        .map((operator) => operator.name);
    return toRegex ? regExp(prioritized) : prioritized;
}

/**
 * Retrieves operators by associativity (side).
 * @param {string} side - The associativity to filter by (e.g., 'left', 'right', 'both').
 * @returns {string[]} - Array of operator names matching the specified side.
 */
export function getOperatorsByAssociativity(side: string) {
    return mathJaxOperators
        .filter((operator) => operator.associativity === side)
        .map((operator) => operator.name);
}

/**
 * Retrieves operators by bracket type.
 * @param {string} bracket - The bracket type to filter by (e.g., 'none', 'left', 'right').
 * @returns {string[]} - Array of operator names matching the specified bracket type.
 */
export function getOperatorsByBracket(bracket: string) {
    return mathJaxOperators
        .filter((operator) => operator.bracket === bracket)
        .map((operator) => operator.name);
}

/**
 * Checks if an operator has implicit multiplication.
 * @param {string} operatorName - The name of the operator to check.
 * @returns {boolean} - True if the operator has implicit multiplication, false otherwise.
 */
export function hasImplicitMultiplication(operatorName: string) {
    const operator = mathJaxOperators.find((op) => op.name === operatorName);
    return operator ? operatorsWithImplicitMultiplication.includes(operator.type) : false;
}
