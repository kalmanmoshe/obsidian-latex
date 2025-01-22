import { z } from "zod";
import { encode } from "js-base64";
import { RegexSnippet, serializeSnippetLike, StringSnippet, VISUAL_SNIPPET_MAGIC_SELECTION_PLACEHOLDER, VisualSnippet } from "./snippets";
import { Options } from "./options";
import { sortSnippets } from "./sort";
import { EXCLUSIONS } from "./environment";
async function importRaw(maybeJavaScriptCode) {
    let raw;
    try {
        try {
            // first, try to import as a plain js module
            // js-base64.encode is needed over builtin `window.btoa` because the latter errors on unicode
            raw = await importModuleDefault(`data:text/javascript;base64,${encode(maybeJavaScriptCode)}`);
        }
        catch {
            // otherwise, try to import as a standalone js object
            raw = await importModuleDefault(`data:text/javascript;base64,${encode(`export default ${maybeJavaScriptCode}`)}`);
        }
    }
    catch (e) {
        throw "Invalid format.";
    }
    return raw;
}
export async function parseSnippetVariables(snippetVariablesStr) {
    const rawSnippetVariables = await importRaw(snippetVariablesStr);
    if (Array.isArray(rawSnippetVariables))
        throw "Cannot parse an array as a variables object";
    const snippetVariables = {};
    for (const [variable, value] of Object.entries(rawSnippetVariables)) {
        if (variable.startsWith("${")) {
            if (!variable.endsWith("}")) {
                throw `Invalid snippet variable name '${variable}': Starts with '\${' but does not end with '}'. You need to have both or neither.`;
            }
            snippetVariables[variable] = value;
        }
        else {
            if (variable.endsWith("}")) {
                throw `Invalid snippet variable name '${variable}': Ends with '}' but does not start with '\${'. You need to have both or neither.`;
            }
            snippetVariables["${" + variable + "}"] = value;
        }
    }
    return snippetVariables;
}
export async function parseSnippets(snippetsStr, snippetVariables) {
    let rawSnippets = await importRaw(snippetsStr);
    let parsedSnippets;
    try {
        // validate the shape of the raw snippets
        rawSnippets = validateRawSnippets(rawSnippets);
        parsedSnippets = rawSnippets.map((raw) => {
            try {
                // Normalize the raw snippet and convert it into a Snippet
                return parseSnippet(raw, snippetVariables);
            }
            catch (e) {
                // provide context of which snippet errored
                throw `${e}\nErroring snippet:\n${serializeSnippetLike(raw)}`;
            }
        });
    }
    catch (e) {
        throw `Invalid snippet format: ${e}`;
    }
    parsedSnippets = sortSnippets(parsedSnippets);
    return parsedSnippets;
}
/** load snippet string as module */
/**
 * imports the default export of a given module.
 *
 * @param module the module to import. this can be a resource path, data url, etc
 * @returns the default export of said module
 * @throws if import fails or default export is undefined
 */
async function importModuleDefault(module) {
    let data;
    try {
        data = await import(module);
    }
    catch (e) {
        throw `failed to import module ${module}`;
    }
    // it's safe to use `in` here - it has a null prototype, so `Object.hasOwnProperty` isn't available,
    // but on the other hand we don't need to worry about something further up the prototype chain messing with this check
    if (!("default" in data)) {
        throw `No default export provided for module ${module}`;
    }
    return data.default;
}
/** raw snippet IR */
const RawSnippetSchema = z.object({
    trigger: z.union([z.string(), z.instanceof(RegExp)]),
    replacement: z.union([z.string(), z.function()]),
    options: z.string(),
    flags: z.string().optional(),
    priority: z.number().optional(),
    description: z.string().optional(),
});
/**
 * tries to parse an unknown value as an array of raw snippets
 * @throws if the value does not adhere to the raw snippet array schema
 */
function validateRawSnippets(snippets) {
    if (!Array.isArray(snippets)) {
        throw new Error("Expected snippets to be an array");
    }
    return snippets.map((raw, index) => {
        const validationResult = RawSnippetSchema.safeParse(raw);
        if (!validationResult.success) {
            const errorMessage = validationResult.error.errors
                .map((error) => `${error.path.join(".")}: ${error.message}`)
                .join(", ");
            throw new Error(`Value does not resemble snippet at index ${index}.\nErrors: ${errorMessage}\nErroring snippet:\n${JSON.stringify(raw, null, 2)}`);
        }
        return validationResult.data;
    });
}
/**
 * Parses a raw snippet.
 * This does the following:
 * - snippet variables are substituted into the trigger
 * - `options.regex` and `options.visual` are set properly
 * - if it is a regex snippet, the trigger is represented as a RegExp instance with flags set
 */
function parseSnippet(raw, snippetVariables) {
    const { replacement, priority, description } = raw;
    const options = Options.fromSource(raw.options);
    let trigger;
    let excludedEnvironments;
    // we have a regex snippet
    if (options.regex || raw.trigger instanceof RegExp) {
        let triggerStr;
        // normalize flags to a string
        let flags = raw.flags ?? "";
        // extract trigger string from trigger,
        // and merge flags, if trigger is a regexp already
        if (raw.trigger instanceof RegExp) {
            triggerStr = raw.trigger.source;
            flags = `${raw.trigger.flags}${flags}`;
        }
        else {
            triggerStr = raw.trigger;
        }
        // filter out invalid flags
        flags = filterFlags(flags);
        // substitute snippet variables
        triggerStr = insertSnippetVariables(triggerStr, snippetVariables);
        // get excluded environment(s) for this trigger, if any
        excludedEnvironments = getExcludedEnvironments(triggerStr);
        // Add $ so regex matches end of string
        // i.e. look for a match at the cursor's current position
        triggerStr = `${triggerStr}$`;
        // convert trigger into RegExp instance
        trigger = new RegExp(triggerStr, flags);
        options.regex = true;
        const normalised = {
            trigger,
            replacement: replacement,
            options,
            priority,
            description,
            excludedEnvironments,
        };
        return new RegexSnippet(normalised);
    }
    else {
        let trigger = raw.trigger;
        // substitute snippet variables
        trigger = insertSnippetVariables(trigger, snippetVariables);
        // get excluded environment(s) for this trigger, if any
        excludedEnvironments = getExcludedEnvironments(trigger);
        // normalize visual replacements
        if (typeof replacement === "string" && replacement.includes(VISUAL_SNIPPET_MAGIC_SELECTION_PLACEHOLDER)) {
            options.visual = true;
        }
        const normalizedReplacement = typeof replacement === "string"
            ? replacement
            : replacement.length === 1
                ? (match) => {
                    const result = replacement(match);
                    if (result === false) {
                        throw new Error("Replacement function returned false, which is not allowed.");
                    }
                    return result;
                }
                : replacement;
        const normalised = {
            trigger,
            replacement: normalizedReplacement,
            options,
            priority,
            description,
            excludedEnvironments,
        };
        if (options.visual) {
            return new VisualSnippet(normalised);
        }
        else {
            return new StringSnippet(normalised);
        }
    }
}
/**
 * removes duplicate flags and filters out invalid ones from a flags string.
 */
function filterFlags(flags) {
    // filter out invalid flags
    const validFlags = [
        // "d", // doesn't affect the search
        // "g", // doesn't affect the pattern match and is almost certainly undesired behavior
        "i",
        "m",
        "s",
        "u",
        "v",
        // "y", // almost certainly undesired behavior
    ];
    return Array.from(new Set(flags.split("")))
        .filter(flag => validFlags.includes(flag))
        .join("");
}
function insertSnippetVariables(trigger, variables) {
    for (const [variable, replacement] of Object.entries(variables)) {
        trigger = trigger.replace(variable, replacement);
    }
    return trigger;
}
function getExcludedEnvironments(trigger) {
    const result = [];
    if (EXCLUSIONS.hasOwnProperty(trigger)) {
        result.push(EXCLUSIONS[trigger]);
    }
    return result;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGFyc2UuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvc25pcHBldHMvcGFyc2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsT0FBTyxFQUFFLENBQUMsRUFBRSxNQUFNLEtBQUssQ0FBQztBQUN4QixPQUFPLEVBQUUsTUFBTSxFQUFFLE1BQU0sV0FBVyxDQUFDO0FBQ25DLE9BQU8sRUFBRSxZQUFZLEVBQUUsb0JBQW9CLEVBQVcsYUFBYSxFQUFFLDBDQUEwQyxFQUFFLGFBQWEsRUFBRSxNQUFNLFlBQVksQ0FBQztBQUNuSixPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sV0FBVyxDQUFDO0FBQ3BDLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxRQUFRLENBQUM7QUFDdEMsT0FBTyxFQUFFLFVBQVUsRUFBZSxNQUFNLGVBQWUsQ0FBQztBQUl4RCxLQUFLLFVBQVUsU0FBUyxDQUFDLG1CQUEyQjtJQUNuRCxJQUFJLEdBQUcsQ0FBQztJQUNSLElBQUksQ0FBQztRQUNKLElBQUksQ0FBQztZQUNKLDRDQUE0QztZQUM1Qyw2RkFBNkY7WUFDN0YsR0FBRyxHQUFHLE1BQU0sbUJBQW1CLENBQUMsK0JBQStCLE1BQU0sQ0FBQyxtQkFBbUIsQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUMvRixDQUFDO1FBQUMsTUFBTSxDQUFDO1lBQ1IscURBQXFEO1lBQ3JELEdBQUcsR0FBRyxNQUFNLG1CQUFtQixDQUFDLCtCQUErQixNQUFNLENBQUMsa0JBQWtCLG1CQUFtQixFQUFFLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDbkgsQ0FBQztJQUNGLENBQUM7SUFBQyxPQUFPLENBQUMsRUFBRSxDQUFDO1FBQ1osTUFBTSxpQkFBaUIsQ0FBQztJQUN6QixDQUFDO0lBQ0QsT0FBTyxHQUFHLENBQUM7QUFDWixDQUFDO0FBRUQsTUFBTSxDQUFDLEtBQUssVUFBVSxxQkFBcUIsQ0FBQyxtQkFBMkI7SUFDdEUsTUFBTSxtQkFBbUIsR0FBRyxNQUFNLFNB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Q0FBQyxPQUFPLENBQUMsUUFBUSxFQUFFLFdBQVcsQ0FBQyxDQUFDO0lBQ2xELENBQUM7SUFFRCxPQUFPLE9BQU8sQ0FBQztBQUNoQixDQUFDO0FBRUQsU0FBUyx1QkFBdUIsQ0FBQyxPQUFlO0lBQy9DLE1BQU0sTUFBTSxHQUFHLEVBQUUsQ0FBQztJQUNsQixJQUFJLFVBQVUsQ0FBQyxjQUFjLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztRQUN4QyxNQUFNLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDO0lBQ2xDLENBQUM7SUFDRCxPQUFPLE1BQU0sQ0FBQztBQUNmLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyB6IH0gZnJvbSBcInpvZFwiO1xyXG5pbXBvcnQgeyBlbmNvZGUgfSBmcm9tIFwianMtYmFzZTY0XCI7XHJcbmltcG9ydCB7IFJlZ2V4U25pcHBldCwgc2VyaWFsaXplU25pcHBldExpa2UsIFNuaXBwZXQsIFN0cmluZ1NuaXBwZXQsIFZJU1VBTF9TTklQUEVUX01BR0lDX1NFTEVDVElPTl9QTEFDRUhPTERFUiwgVmlzdWFsU25pcHBldCB9IGZyb20gXCIuL3NuaXBwZXRzXCI7XHJcbmltcG9ydCB7IE9wdGlvbnMgfSBmcm9tIFwiLi9vcHRpb25zXCI7XHJcbmltcG9ydCB7IHNvcnRTbmlwcGV0cyB9IGZyb20gXCIuL3NvcnRcIjtcclxuaW1wb3J0IHsgRVhDTFVTSU9OUywgRW52aXJvbm1lbnQgfSBmcm9tIFwiLi9lbnZpcm9ubWVudFwiO1xyXG5cclxuZXhwb3J0IHR5cGUgU25pcHBldFZhcmlhYmxlcyA9IFJlY29yZDxzdHJpbmcsIHN0cmluZz47XHJcblxyXG5hc3luYyBmdW5jdGlvbiBpbXBvcnRSYXcobWF5YmVKYXZhU2NyaXB0Q29kZTogc3RyaW5nKSB7XHJcblx0bGV0IHJhdztcclxuXHR0cnkge1xyXG5cdFx0dHJ5IHtcclxuXHRcdFx0Ly8gZmlyc3QsIHRyeSB0byBpbXBvcnQgYXMgYSBwbGFpbiBqcyBtb2R1bGVcclxuXHRcdFx0Ly8ganMtYmFzZTY0LmVuY29kZSBpcyBuZWVkZWQgb3ZlciBidWlsdGluIGB3aW5kb3cuYnRvYWAgYmVjYXVzZSB0aGUgbGF0dGVyIGVycm9ycyBvbiB1bmljb2RlXHJcblx0XHRcdHJhdyA9IGF3YWl0IGltcG9ydE1vZHVsZURlZmF1bHQoYGRhdGE6dGV4dC9qYXZhc2NyaXB0O2Jhc2U2NCwke2VuY29kZShtYXliZUphdmFTY3JpcHRDb2RlKX1gKTtcclxuXHRcdH0gY2F0Y2gge1xyXG5cdFx0XHQvLyBvdGhlcndpc2UsIHRyeSB0byBpbXBvcnQgYXMgYSBzdGFuZGFsb25lIGpzIG9iamVjdFxyXG5cdFx0XHRyYXcgPSBhd2FpdCBpbXBvcnRNb2R1bGVEZWZhdWx0KGBkYXRhOnRleHQvamF2YXNjcmlwdDtiYXNlNjQsJHtlbmNvZGUoYGV4cG9ydCBkZWZhdWx0ICR7bWF5YmVKYXZhU2NyaXB0Q29kZX1gKX1gKTtcclxuXHRcdH1cclxuXHR9IGNhdGNoIChlKSB7XHJcblx0XHR0aHJvdyBcIkludmFsaWQgZm9ybWF0LlwiO1xyXG5cdH1cclxuXHRyZXR1cm4gcmF3O1xyXG59XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcGFyc2VTbmlwcGV0VmFyaWFibGVzKHNuaXBwZXRWYXJpYWJsZXNTdHI6IHN0cmluZykge1xyXG5cdGNvbnN0IHJhd1NuaXBwZXRWYXJpYWJsZXMgPSBhd2FpdCBpbXBvcnRSYXcoc25pcHBldFZhcmlhYmxlc1N0cikgYXMgU25pcHBldFZhcmlhYmxlcztcclxuXHJcblx0aWYgKEFycmF5LmlzQXJyYXkocmF3U25pcHBldFZhcmlhYmxlcykpXHJcblx0XHR0aHJvdyBcIkNhbm5vdCBwYXJzZSBhbiBhcnJheSBhcyBhIHZhcmlhYmxlcyBvYmplY3RcIjtcclxuXHJcblx0Y29uc3Qgc25pcHBldFZhcmlhYmxlczogU25pcHBldFZhcmlhYmxlcyA9IHt9O1xyXG5cdGZvciAoY29uc3QgW3ZhcmlhYmxlLCB2YWx1ZV0gb2YgT2JqZWN0LmVudHJpZXMocmF3U25pcHBldFZhcmlhYmxlcykpIHtcclxuXHRcdGlmICh2YXJpYWJsZS5zdGFydHNXaXRoKFwiJHtcIikpIHtcclxuXHRcdFx0aWYgKCF2YXJpYWJsZS5lbmRzV2l0aChcIn1cIikpIHtcclxuXHRcdFx0XHR0aHJvdyBgSW52YWxpZCBzbmlwcGV0IHZhcmlhYmxlIG5hbWUgJyR7dmFyaWFibGV9JzogU3RhcnRzIHdpdGggJ1xcJHsnIGJ1dCBkb2VzIG5vdCBlbmQgd2l0aCAnfScuIFlvdSBuZWVkIHRvIGhhdmUgYm90aCBvciBuZWl0aGVyLmA7XHJcblx0XHRcdH1cclxuXHRcdFx0c25pcHBldFZhcmlhYmxlc1t2YXJpYWJsZV0gPSB2YWx1ZTtcclxuXHRcdH0gZWxzZSB7XHJcblx0XHRcdGlmICh2YXJpYWJsZS5lbmRzV2l0aChcIn1cIikpIHtcclxuXHRcdFx0XHR0aHJvdyBgSW52YWxpZCBzbmlwcGV0IHZhcmlhYmxlIG5hbWUgJyR7dmFyaWFibGV9JzogRW5kcyB3aXRoICd9JyBidXQgZG9lcyBub3Qgc3RhcnQgd2l0aCAnXFwkeycuIFlvdSBuZWVkIHRvIGhhdmUgYm90aCBvciBuZWl0aGVyLmA7XHJcblx0XHRcdH1cclxuXHRcdFx0c25pcHBldFZhcmlhYmxlc1tcIiR7XCIgKyB2YXJpYWJsZSArIFwifVwiXSA9IHZhbHVlO1xyXG5cdFx0fVxyXG5cdH1cclxuXHRyZXR1cm4gc25pcHBldFZhcmlhYmxlcztcclxufVxyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHBhcnNlU25pcHBldHMoc25pcHBldHNTdHI6IHN0cmluZywgc25pcHBldFZhcmlhYmxlczogU25pcHBldFZhcmlhYmxlcykge1xyXG5cdGxldCByYXdTbmlwcGV0cyA9IGF3YWl0IGltcG9ydFJhdyhzbmlwcGV0c1N0cikgYXMgUmF3U25pcHBldFtdO1xyXG5cclxuXHRsZXQgcGFyc2VkU25pcHBldHM7XHJcblx0dHJ5IHtcclxuXHRcdC8vIHZhbGlkYXRlIHRoZSBzaGFwZSBvZiB0aGUgcmF3IHNuaXBwZXRzXHJcblx0XHRyYXdTbmlwcGV0cyA9IHZhbGlkYXRlUmF3U25pcHBldHMocmF3U25pcHBldHMpO1xyXG5cclxuXHRcdHBhcnNlZFNuaXBwZXRzID0gcmF3U25pcHBldHMubWFwKChyYXcpID0+IHtcclxuXHRcdFx0dHJ5IHtcclxuXHRcdFx0XHQvLyBOb3JtYWxpemUgdGhlIHJhdyBzbmlwcGV0IGFuZCBjb252ZXJ0IGl0IGludG8gYSBTbmlwcGV0XHJcblx0XHRcdFx0cmV0dXJuIHBhcnNlU25pcHBldChyYXcsIHNuaXBwZXRWYXJpYWJsZXMpO1xyXG5cdFx0XHR9IGNhdGNoIChlKSB7XHJcblx0XHRcdFx0Ly8gcHJvdmlkZSBjb250ZXh0IG9mIHdoaWNoIHNuaXBwZXQgZXJyb3JlZFxyXG5cdFx0XHRcdHRocm93IGAke2V9XFxuRXJyb3Jpbmcgc25pcHBldDpcXG4ke3NlcmlhbGl6ZVNuaXBwZXRMaWtlKHJhdyl9YDtcclxuXHRcdFx0fVxyXG5cdFx0fSk7XHJcblx0fSBjYXRjaChlKSB7XHJcblx0XHR0aHJvdyBgSW52YWxpZCBzbmlwcGV0IGZvcm1hdDogJHtlfWA7XHJcblx0fVxyXG5cclxuXHRwYXJzZWRTbmlwcGV0cyA9IHNvcnRTbmlwcGV0cyhwYXJzZWRTbmlwcGV0cyk7XHJcblx0cmV0dXJuIHBhcnNlZFNuaXBwZXRzO1xyXG59XHJcblxyXG4vKiogbG9hZCBzbmlwcGV0IHN0cmluZyBhcyBtb2R1bGUgKi9cclxuXHJcbi8qKlxyXG4gKiBpbXBvcnRzIHRoZSBkZWZhdWx0IGV4cG9ydCBvZiBhIGdpdmVuIG1vZHVsZS5cclxuICpcclxuICogQHBhcmFtIG1vZHVsZSB0aGUgbW9kdWxlIHRvIGltcG9ydC4gdGhpcyBjYW4gYmUgYSByZXNvdXJjZSBwYXRoLCBkYXRhIHVybCwgZXRjXHJcbiAqIEByZXR1cm5zIHRoZSBkZWZhdWx0IGV4cG9ydCBvZiBzYWlkIG1vZHVsZVxyXG4gKiBAdGhyb3dzIGlmIGltcG9ydCBmYWlscyBvciBkZWZhdWx0IGV4cG9ydCBpcyB1bmRlZmluZWRcclxuICovXHJcbmFzeW5jIGZ1bmN0aW9uIGltcG9ydE1vZHVsZURlZmF1bHQobW9kdWxlOiBzdHJpbmcpOiBQcm9taXNlPHVua25vd24+IHtcclxuXHRsZXQgZGF0YTtcclxuXHR0cnkge1xyXG5cdFx0ZGF0YSA9IGF3YWl0IGltcG9ydChtb2R1bGUpO1xyXG5cdH0gY2F0Y2ggKGUpIHtcclxuXHRcdHRocm93IGBmYWlsZWQgdG8gaW1wb3J0IG1vZHVsZSAke21vZHVsZX1gO1xyXG5cdH1cclxuXHJcblx0Ly8gaXQncyBzYWZlIHRvIHVzZSBgaW5gIGhlcmUgLSBpdCBoYXMgYSBudWxsIHByb3RvdHlwZSwgc28gYE9iamVjdC5oYXNPd25Qcm9wZXJ0eWAgaXNuJ3QgYXZhaWxhYmxlLFxyXG5cdC8vIGJ1dCBvbiB0aGUgb3RoZXIgaGFuZCB3ZSBkb24ndCBuZWVkIHRvIHdvcnJ5IGFib3V0IHNvbWV0aGluZyBmdXJ0aGVyIHVwIHRoZSBwcm90b3R5cGUgY2hhaW4gbWVzc2luZyB3aXRoIHRoaXMgY2hlY2tcclxuXHRpZiAoIShcImRlZmF1bHRcIiBpbiBkYXRhKSkge1xyXG5cdFx0dGhyb3cgYE5vIGRlZmF1bHQgZXhwb3J0IHByb3ZpZGVkIGZvciBtb2R1bGUgJHttb2R1bGV9YDtcclxuXHR9XHJcblxyXG5cdHJldHVybiBkYXRhLmRlZmF1bHQ7XHJcbn1cclxuXHJcbi8qKiByYXcgc25pcHBldCBJUiAqL1xyXG5cclxuY29uc3QgUmF3U25pcHBldFNjaGVtYSA9IHoub2JqZWN0KHtcclxuICAgIHRyaWdnZXI6IHoudW5pb24oW3ouc3RyaW5nKCksIHouaW5zdGFuY2VvZihSZWdFeHApXSksXHJcbiAgICByZXBsYWNlbWVudDogei51bmlvbihbei5zdHJpbmcoKSwgei5mdW5jdGlvbigpXSksXHJcbiAgICBvcHRpb25zOiB6LnN0cmluZygpLFxyXG4gICAgZmxhZ3M6IHouc3RyaW5nKCkub3B0aW9uYWwoKSxcclxuICAgIHByaW9yaXR5OiB6Lm51bWJlcigpLm9wdGlvbmFsKCksXHJcbiAgICBkZXNjcmlwdGlvbjogei5zdHJpbmcoKS5vcHRpb25hbCgpLFxyXG4gIH0pO1xyXG5cclxudHlwZSBSYXdTbmlwcGV0ID0gei5pbmZlcjx0eXBlb2YgUmF3U25pcHBldFNjaGVtYT47XHJcblxyXG4vKipcclxuICogdHJpZXMgdG8gcGFyc2UgYW4gdW5rbm93biB2YWx1ZSBhcyBhbiBhcnJheSBvZiByYXcgc25pcHBldHNcclxuICogQHRocm93cyBpZiB0aGUgdmFsdWUgZG9lcyBub3QgYWRoZXJlIHRvIHRoZSByYXcgc25pcHBldCBhcnJheSBzY2hlbWFcclxuICovXHJcbmZ1bmN0aW9uIHZhbGlkYXRlUmF3U25pcHBldHMoc25pcHBldHM6IHVua25vd24pOiBSYXdTbmlwcGV0W10ge1xyXG4gIGlmICghQXJyYXkuaXNBcnJheShzbmlwcGV0cykpIHtcclxuICAgIHRocm93IG5ldyBFcnJvcihcIkV4cGVjdGVkIHNuaXBwZXRzIHRvIGJlIGFuIGFycmF5XCIpO1xyXG4gIH1cclxuXHJcbiAgcmV0dXJuIHNuaXBwZXRzLm1hcCgocmF3LCBpbmRleCkgPT4ge1xyXG4gICAgY29uc3QgdmFsaWRhdGlvblJlc3VsdCA9IFJhd1NuaXBwZXRTY2hlbWEuc2FmZVBhcnNlKHJhdyk7XHJcblxyXG4gICAgaWYgKCF2YWxpZGF0aW9uUmVzdWx0LnN1Y2Nlc3MpIHtcclxuICAgICAgY29uc3QgZXJyb3JNZXNzYWdlID0gdmFsaWRhdGlvblJlc3VsdC5lcnJvci5lcnJvcnNcclxuICAgICAgICAubWFwKChlcnJvcikgPT4gYCR7ZXJyb3IucGF0aC5qb2luKFwiLlwiKX06ICR7ZXJyb3IubWVzc2FnZX1gKVxyXG4gICAgICAgIC5qb2luKFwiLCBcIik7XHJcbiAgICAgIHRocm93IG5ldyBFcnJvcihcclxuICAgICAgICBgVmFsdWUgZG9lcyBub3QgcmVzZW1ibGUgc25pcHBldCBhdCBpbmRleCAke2luZGV4fS5cXG5FcnJvcnM6ICR7ZXJyb3JNZXNzYWdlfVxcbkVycm9yaW5nIHNuaXBwZXQ6XFxuJHtKU09OLnN0cmluZ2lmeShcclxuICAgICAgICAgIHJhdyxcclxuICAgICAgICAgIG51bGwsXHJcbiAgICAgICAgICAyXHJcbiAgICAgICAgKX1gXHJcbiAgICAgICk7XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIHZhbGlkYXRpb25SZXN1bHQuZGF0YTtcclxuICB9KTtcclxufVxyXG5cclxuLyoqXHJcbiAqIFBhcnNlcyBhIHJhdyBzbmlwcGV0LlxyXG4gKiBUaGlzIGRvZXMgdGhlIGZvbGxvd2luZzpcclxuICogLSBzbmlwcGV0IHZhcmlhYmxlcyBhcmUgc3Vic3RpdHV0ZWQgaW50byB0aGUgdHJpZ2dlclxyXG4gKiAtIGBvcHRpb25zLnJlZ2V4YCBhbmQgYG9wdGlvbnMudmlzdWFsYCBhcmUgc2V0IHByb3Blcmx5XHJcbiAqIC0gaWYgaXQgaXMgYSByZWdleCBzbmlwcGV0LCB0aGUgdHJpZ2dlciBpcyByZXByZXNlbnRlZCBhcyBhIFJlZ0V4cCBpbnN0YW5jZSB3aXRoIGZsYWdzIHNldFxyXG4gKi9cclxuZnVuY3Rpb24gcGFyc2VTbmlwcGV0KHJhdzogUmF3U25pcHBldCwgc25pcHBldFZhcmlhYmxlczogU25pcHBldFZhcmlhYmxlcyk6IFNuaXBwZXQge1xyXG5cdFxyXG5cdGNvbnN0IHsgcmVwbGFjZW1lbnQsIHByaW9yaXR5LCBkZXNjcmlwdGlvbiB9ID0gcmF3O1xyXG5cdGNvbnN0IG9wdGlvbnMgPSBPcHRpb25zLmZyb21Tb3VyY2UocmF3Lm9wdGlvbnMpO1xyXG5cdGxldCB0cmlnZ2VyO1xyXG5cdGxldCBleGNsdWRlZEVudmlyb25tZW50cztcclxuXHJcblx0Ly8gd2UgaGF2ZSBhIHJlZ2V4IHNuaXBwZXRcclxuXHRpZiAob3B0aW9ucy5yZWdleCB8fCByYXcudHJpZ2dlciBpbnN0YW5jZW9mIFJlZ0V4cCkge1xyXG5cdFx0bGV0IHRyaWdnZXJTdHI6IHN0cmluZztcclxuXHRcdC8vIG5vcm1hbGl6ZSBmbGFncyB0byBhIHN0cmluZ1xyXG5cdFx0bGV0IGZsYWdzID0gcmF3LmZsYWdzID8/IFwiXCI7XHJcblxyXG5cdFx0Ly8gZXh0cmFjdCB0cmlnZ2VyIHN0cmluZyBmcm9tIHRyaWdnZXIsXHJcblx0XHQvLyBhbmQgbWVyZ2UgZmxhZ3MsIGlmIHRyaWdnZXIgaXMgYSByZWdleHAgYWxyZWFkeVxyXG5cdFx0aWYgKHJhdy50cmlnZ2VyIGluc3RhbmNlb2YgUmVnRXhwKSB7XHJcblx0XHRcdHRyaWdnZXJTdHIgPSByYXcudHJpZ2dlci5zb3VyY2U7XHJcblx0XHRcdGZsYWdzID0gYCR7KHJhdy50cmlnZ2VyIGFzIFJlZ0V4cCkuZmxhZ3N9JHtmbGFnc31gO1xyXG5cdFx0fSBlbHNlIHtcclxuXHRcdFx0dHJpZ2dlclN0ciA9IHJhdy50cmlnZ2VyO1xyXG5cdFx0fVxyXG5cdFx0Ly8gZmlsdGVyIG91dCBpbnZhbGlkIGZsYWdzXHJcblx0XHRmbGFncyA9IGZpbHRlckZsYWdzKGZsYWdzKTtcclxuXHJcblx0XHQvLyBzdWJzdGl0dXRlIHNuaXBwZXQgdmFyaWFibGVzXHJcblx0XHR0cmlnZ2VyU3RyID0gaW5zZXJ0U25pcHBldFZhcmlhYmxlcyh0cmlnZ2VyU3RyLCBzbmlwcGV0VmFyaWFibGVzKTtcclxuXHJcblx0XHQvLyBnZXQgZXhjbHVkZWQgZW52aXJvbm1lbnQocykgZm9yIHRoaXMgdHJpZ2dlciwgaWYgYW55XHJcblx0XHRleGNsdWRlZEVudmlyb25tZW50cyA9IGdldEV4Y2x1ZGVkRW52aXJvbm1lbnRzKHRyaWdnZXJTdHIpO1xyXG5cclxuXHRcdC8vIEFkZCAkIHNvIHJlZ2V4IG1hdGNoZXMgZW5kIG9mIHN0cmluZ1xyXG5cdFx0Ly8gaS5lLiBsb29rIGZvciBhIG1hdGNoIGF0IHRoZSBjdXJzb3IncyBjdXJyZW50IHBvc2l0aW9uXHJcblx0XHR0cmlnZ2VyU3RyID0gYCR7dHJpZ2dlclN0cn0kYDtcclxuXHJcblx0XHQvLyBjb252ZXJ0IHRyaWdnZXIgaW50byBSZWdFeHAgaW5zdGFuY2VcclxuXHRcdHRyaWdnZXIgPSBuZXcgUmVnRXhwKHRyaWdnZXJTdHIsIGZsYWdzKTtcclxuXHJcblx0XHRvcHRpb25zLnJlZ2V4ID0gdHJ1ZTtcclxuXHJcblx0XHRjb25zdCBub3JtYWxpc2VkID0ge1xyXG5cdFx0XHR0cmlnZ2VyLFxyXG5cdFx0XHRyZXBsYWNlbWVudDogcmVwbGFjZW1lbnQgYXMgc3RyaW5nIHwgKChtYXRjaDogUmVnRXhwRXhlY0FycmF5KSA9PiBzdHJpbmcpLFxyXG5cdFx0XHRvcHRpb25zLFxyXG5cdFx0XHRwcmlvcml0eSxcclxuXHRcdFx0ZGVzY3JpcHRpb24sXHJcblx0XHRcdGV4Y2x1ZGVkRW52aXJvbm1lbnRzLFxyXG5cdFx0fTtcdFx0XHJcblx0XHRyZXR1cm4gbmV3IFJlZ2V4U25pcHBldChub3JtYWxpc2VkKTtcclxuXHR9XHJcblx0ZWxzZSB7XHJcblx0XHRsZXQgdHJpZ2dlciA9IHJhdy50cmlnZ2VyIGFzIHN0cmluZztcclxuXHRcdC8vIHN1YnN0aXR1dGUgc25pcHBldCB2YXJpYWJsZXNcclxuXHRcdHRyaWdnZXIgPSBpbnNlcnRTbmlwcGV0VmFyaWFibGVzKHRyaWdnZXIsIHNuaXBwZXRWYXJpYWJsZXMpO1xyXG5cclxuXHRcdC8vIGdldCBleGNsdWRlZCBlbnZpcm9ubWVudChzKSBmb3IgdGhpcyB0cmlnZ2VyLCBpZiBhbnlcclxuXHRcdGV4Y2x1ZGVkRW52aXJvbm1lbnRzID0gZ2V0RXhjbHVkZWRFbnZpcm9ubWVudHModHJpZ2dlcik7XHJcblxyXG5cdFx0Ly8gbm9ybWFsaXplIHZpc3VhbCByZXBsYWNlbWVudHNcclxuXHRcdGlmICh0eXBlb2YgcmVwbGFjZW1lbnQgPT09IFwic3RyaW5nXCIgJiYgcmVwbGFjZW1lbnQuaW5jbHVkZXMoVklTVUFMX1NOSVBQRVRfTUFHSUNfU0VMRUNUSU9OX1BMQUNFSE9MREVSKSkge1xyXG5cdFx0XHRvcHRpb25zLnZpc3VhbCA9IHRydWU7XHJcblx0XHR9XHJcblx0XHRjb25zdCBub3JtYWxpemVkUmVwbGFjZW1lbnQ6IHN0cmluZyB8ICgobWF0Y2g6IHN0cmluZykgPT4gc3RyaW5nKSA9XHJcblx0XHR0eXBlb2YgcmVwbGFjZW1lbnQgPT09IFwic3RyaW5nXCJcclxuXHRcdFx0PyByZXBsYWNlbWVudFxyXG5cdFx0XHQ6IChyZXBsYWNlbWVudCBhcyAoc2VsZWN0aW9uOiBzdHJpbmcpID0+IHN0cmluZyB8IGZhbHNlKS5sZW5ndGggPT09IDFcclxuXHRcdFx0PyAobWF0Y2g6IHN0cmluZykgPT4ge1xyXG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IChyZXBsYWNlbWVudCBhcyAoc2VsZWN0aW9uOiBzdHJpbmcpID0+IHN0cmluZyB8IGZhbHNlKShtYXRjaCk7XHJcblx0XHRcdFx0aWYgKHJlc3VsdCA9PT0gZmFsc2UpIHtcclxuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcihcIlJlcGxhY2VtZW50IGZ1bmN0aW9uIHJldHVybmVkIGZhbHNlLCB3aGljaCBpcyBub3QgYWxsb3dlZC5cIik7XHJcblx0XHRcdFx0fVxyXG5cdFx0XHRcdHJldHVybiByZXN1bHQ7XHJcblx0XHRcdH1cclxuXHRcdFx0OiByZXBsYWNlbWVudCBhcyAobWF0Y2g6IHN0cmluZykgPT4gc3RyaW5nO1xyXG5cdFx0Y29uc3Qgbm9ybWFsaXNlZCA9IHtcclxuXHRcdFx0dHJpZ2dlcixcclxuXHRcdFx0cmVwbGFjZW1lbnQ6IG5vcm1hbGl6ZWRSZXBsYWNlbWVudCxcclxuXHRcdFx0b3B0aW9ucyxcclxuXHRcdFx0cHJpb3JpdHksXHJcblx0XHRcdGRlc2NyaXB0aW9uLFxyXG5cdFx0XHRleGNsdWRlZEVudmlyb25tZW50cyxcclxuXHRcdH07XHJcblx0XHRpZiAob3B0aW9ucy52aXN1YWwpIHtcclxuXHRcdFx0cmV0dXJuIG5ldyBWaXN1YWxTbmlwcGV0KG5vcm1hbGlzZWQpO1xyXG5cdFx0fVxyXG5cdFx0ZWxzZSB7XHJcblx0XHRcdHJldHVybiBuZXcgU3RyaW5nU25pcHBldChub3JtYWxpc2VkKTtcclxuXHRcdH1cclxuXHR9XHJcbn1cclxuXHJcblxyXG5cclxuLyoqXHJcbiAqIHJlbW92ZXMgZHVwbGljYXRlIGZsYWdzIGFuZCBmaWx0ZXJzIG91dCBpbnZhbGlkIG9uZXMgZnJvbSBhIGZsYWdzIHN0cmluZy5cclxuICovXHJcbmZ1bmN0aW9uIGZpbHRlckZsYWdzKGZsYWdzOiBzdHJpbmcpOiBzdHJpbmcge1xyXG5cdC8vIGZpbHRlciBvdXQgaW52YWxpZCBmbGFnc1xyXG5cdGNvbnN0IHZhbGlkRmxhZ3MgPSBbXHJcblx0XHQvLyBcImRcIiwgLy8gZG9lc24ndCBhZmZlY3QgdGhlIHNlYXJjaFxyXG5cdFx0Ly8gXCJnXCIsIC8vIGRvZXNuJ3QgYWZmZWN0IHRoZSBwYXR0ZXJuIG1hdGNoIGFuZCBpcyBhbG1vc3QgY2VydGFpbmx5IHVuZGVzaXJlZCBiZWhhdmlvclxyXG5cdFx0XCJpXCIsXHJcblx0XHRcIm1cIixcclxuXHRcdFwic1wiLFxyXG5cdFx0XCJ1XCIsXHJcblx0XHRcInZcIixcclxuXHRcdC8vIFwieVwiLCAvLyBhbG1vc3QgY2VydGFpbmx5IHVuZGVzaXJlZCBiZWhhdmlvclxyXG5cdF07XHJcblx0cmV0dXJuIEFycmF5LmZyb20obmV3IFNldChmbGFncy5zcGxpdChcIlwiKSkpXHJcblx0XHRcdC5maWx0ZXIoZmxhZyA9PiB2YWxpZEZsYWdzLmluY2x1ZGVzKGZsYWcpKVxyXG5cdFx0XHQuam9pbihcIlwiKTtcclxufVxyXG5cclxuZnVuY3Rpb24gaW5zZXJ0U25pcHBldFZhcmlhYmxlcyh0cmlnZ2VyOiBzdHJpbmcsIHZhcmlhYmxlczogU25pcHBldFZhcmlhYmxlcykge1xyXG5cdGZvciAoY29uc3QgW3ZhcmlhYmxlLCByZXBsYWNlbWVudF0gb2YgT2JqZWN0LmVudHJpZXModmFyaWFibGVzKSkge1xyXG5cdFx0dHJpZ2dlciA9IHRyaWdnZXIucmVwbGFjZSh2YXJpYWJsZSwgcmVwbGFjZW1lbnQpO1xyXG5cdH1cclxuXHJcblx0cmV0dXJuIHRyaWdnZXI7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGdldEV4Y2x1ZGVkRW52aXJvbm1lbnRzKHRyaWdnZXI6IHN0cmluZyk6IEVudmlyb25tZW50W10ge1xyXG5cdGNvbnN0IHJlc3VsdCA9IFtdO1xyXG5cdGlmIChFWENMVVNJT05TLmhhc093blByb3BlcnR5KHRyaWdnZXIpKSB7XHJcblx0XHRyZXN1bHQucHVzaChFWENMVVNJT05TW3RyaWdnZXJdKTtcclxuXHR9XHJcblx0cmV0dXJuIHJlc3VsdDtcclxufVxyXG4iXX0=