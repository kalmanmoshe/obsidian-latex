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


