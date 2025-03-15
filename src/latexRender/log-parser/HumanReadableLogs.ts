import LatexLogParser, { CurrentError, Options } from './latex-log-parser'
import ruleset, { ErrorRuleId } from './HumanReadableLogsRules.tsx'
import { Notice } from 'obsidian'
function parse(rawLog: string, options?: Options) {
    const parsedLogEntries =
      typeof rawLog === 'string'
        ? new LatexLogParser(rawLog, options).parse()
        : rawLog
    
    const seenErrorTypes: Record<string,boolean> = {} // keep track of types of errors seen

    for (const entry of parsedLogEntries.all) {
        const ruleDetails = ruleset.find(rule =>
            rule.regexToMatch.test(entry.message)
        )
        if(!ruleDetails){
            if(entry.level==="error"){
                console.error("No rule found for: "+entry.message);
                new Notice("No rule found for: "+entry.message);
            }
            continue;
        }

        if (ruleDetails.ruleId) entry.ruleId = ruleDetails.ruleId;

        if (ruleDetails.newMessage) {
            entry.message = entry.message.replace(
                ruleDetails.regexToMatch,
                ruleDetails.newMessage
            )
        }

        if (ruleDetails.contentRegex) {
            if(!entry.content)throw new Error("entry content is null");
            const match = entry.content.match(ruleDetails.contentRegex)
            if (match) {
                entry.contentDetails = match.slice(1)
            }
        }

        if (entry.contentDetails && ruleDetails.improvedTitle) {
            if(entry.contentDetails.length!==1){
                throw new Error ("contentDetails length is not 1, got: "+entry.contentDetails+ "i dont knew why this is a problem but so be it");
            }
            const message = ruleDetails.improvedTitle(
                entry.message,
                entry.contentDetails as [string]
            )

            if (Array.isArray(message)) {
                entry.message = message[0]
                // removing the messageComponent, as the markup possible in it was causing crashes when
                //  attempting to broadcast it in the detach-context (cant structuredClone an html node)
                // see https://github.com/overleaf/internal/discussions/15031 for context
                // entry.messageComponent = message[1]
            } else {
                entry.message = message
            }
        }

        if (entry.contentDetails && ruleDetails.highlightCommand) {
            entry.command = ruleDetails.highlightCommand(entry.contentDetails)
        }

        // suppress any entries that are known to cascade from previous error types
        if (ruleDetails.cascadesFrom) {
            for (const type of ruleDetails.cascadesFrom) {
                if (seenErrorTypes[type]) {
                    entry.suppressed = true
                }
            }
        }

        // record the types of errors seen
        if (ruleDetails.types) {
            for (const type of ruleDetails.types) {
                seenErrorTypes[type] = true
            }
        }
        
    }
    // filter out the suppressed errors (from the array entries in parsedLogEntries)
    for (const [key, errors] of Object.entries(parsedLogEntries) as [keyof typeof parsedLogEntries, CurrentError[]][]) {
        if (Array.isArray(errors) && errors.length > 0) {
          parsedLogEntries[key] = errors.filter((err) => !err.suppressed);
        }
      }      

    return parsedLogEntries
}
export default parse;

interface ErrorMessage {
    title: string
    explanation?: string
    triggeringPackage?: string
    cause?: string
    line?: number
}

function refactorToErrorMessage(err: CurrentError): ErrorMessage {
    return {
        title: err.message,
        //explanation: err.messageComponent?.textContent,
        cause: err.command||err.contentDetails?.[0]||err.content,
        line: err.line||undefined,
    }

}
export function createLatexErrorMessage(errId: ErrorRuleId,errorInfo: {line?: number,cause?: string}={}): ErrorMessage {
    const rule = ruleset.find(rule => rule.ruleId === errId);
    if(!rule)throw new Error("No rule found for: "+errId);
    let title = rule.newMessage||ErrorRuleId[errId].replace(/_/g, " ");
    let line = errorInfo.line;
    let explanation
    let cause = errorInfo.cause;

    return {title,explanation,cause,line}
}

export function createErrorDisplay(err: any){
    if(typeof err === "string"){
        const log = parse(err);
        console.error("LaTeX Error:", log, [err]);
        return errorDiv(refactorToErrorMessage(log.errors[0]))
    }
    return errorDiv(err);
}


export function errorDiv(info: ErrorMessage): HTMLElement {
    const { title, cause, line, explanation,triggeringPackage } = info;
    const container = Object.assign(document.createElement("div"), { 
        className: "moshe-swift-latex-error-container" 
    });
    
    const content = Object.assign(document.createElement("div"), { 
        className: "moshe-swift-latex-error-content" 
    });
    container.appendChild(content);
    
    const errorDetails = [
        ["moshe-swift-latex-error-title", title],
        ["moshe-swift-latex-error-explanation", explanation],
        ["moshe-swift-latex-error-cause", `Triggered from ${cause}`],
        ["moshe-swift-latex-error-package", triggeringPackage?`Package: ${triggeringPackage}`:undefined],
        ["moshe-swift-latex-error-line", line?`At line: ${line}`:undefined]
    ];
    
    errorDetails.forEach(([className, textContent]) => {
        if(!textContent)return;
        content.appendChild(Object.assign(document.createElement("div"), { className, textContent }));
    });

    return container;
}





