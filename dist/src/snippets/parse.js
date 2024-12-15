import { z } from "zod";
import { encode } from "js-base64";
import { serializeSnippetLike, StringSnippet } from "./snippets";
import { Options } from "./options";
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
    //parsedSnippets = sortSnippets(parsedSnippets);
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
    return new StringSnippet({ trigger: 'cd', replacement: '\\cdot', options: new Options() });
    // we have a regex snippet
    if (options.regex || raw.trigger instanceof RegExp) {
        let triggerStr;
        // normalize flags to a string
        let flags = raw.flags ?? "";
        // extract trigger string from trigger,
        // and merge flags, if trigger is a regexp already
        if (raw.trigger instanceof RegExp) {
            //triggerStr = raw.trigger.source;
            flags = `${raw.trigger.flags}${flags}`;
        }
        else {
            //triggerStr = raw.trigger;
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
        const normalised = { trigger, replacement, options, priority, description, excludedEnvironments };
        //return new RegexSnippet(normalised);
    }
    else {
        let trigger = raw.trigger;
        // substitute snippet variables
        trigger = insertSnippetVariables(trigger, snippetVariables);
        // get excluded environment(s) for this trigger, if any
        excludedEnvironments = getExcludedEnvironments(trigger);
        // normalize visual replacements
        /*if (typeof replacement === "string" && replacement.includes(VISUAL_SNIPPET_MAGIC_SELECTION_PLACEHOLDER)) {
            options.visual = true;
        }*/
        const normalised = { trigger, replacement, options, priority, description, excludedEnvironments };
        if (options.visual) {
            //return new VisualSnippet(normalised);
        }
        else {
            //return new StringSnippet(normalised);
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
    /*if (EXCLUSIONS.hasOwnProperty(trigger)) {
        result.push(EXCLUSIONS[trigger]);
    }*/
    return result;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGFyc2UuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvc25pcHBldHMvcGFyc2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsT0FBTyxFQUFFLENBQUMsRUFBRSxNQUFNLEtBQUssQ0FBQztBQUN4QixPQUFPLEVBQUUsTUFBTSxFQUFFLE1BQU0sV0FBVyxDQUFDO0FBQ25DLE9BQU8sRUFBNkIsb0JBQW9CLEVBQVcsYUFBYSxFQUE2RCxNQUFNLFlBQVksQ0FBQztBQUNoSyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sV0FBVyxDQUFDO0FBT3BDLEtBQUssVUFBVSxTQUFTLENBQUMsbUJBQTJCO0lBQ25ELElBQUksR0FBRyxDQUFDO0lBQ1IsSUFBSSxDQUFDO1FBQ0osSUFBSSxDQUFDO1lBQ0osNENBQTRDO1lBQzVDLDZGQUE2RjtZQUM3RixHQUFHLEdBQUcsTUFBTSxtQkFBbUIsQ0FBQywrQkFBK0IsTUFBTSxDQUFDLG1CQUFtQixDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQy9GLENBQUM7UUFBQyxNQUFNLENBQUM7WUFDUixxREFBcUQ7WUFDckQsR0FBRyxHQUFHLE1BQU0sbUJBQW1CLENBQUMsK0JBQStCLE1BQU0sQ0FBQyxrQkFBa0IsbUJBQW1CLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUNuSCxDQUFDO0lBQ0YsQ0FBQztJQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7UUFDWixNQUFNLGlCQUFpQixDQUFDO0lBQ3pCLENBQUM7SUFDRCxPQUFPLEdBQUcsQ0FBQztBQUNaLENBQUM7QUFFRCxNQUFNLENBQUMsS0FBSyxVQUFVLHFCQUFxQixDQUFDLG1CQUEyQjtJQUN0RSxNQUFNLG1CQUFtQixHQUFHLE1BQU0sU0FBUyxDQUFDLG1CQUFtQixDQUFxQixDQUFDO0lBRXJGLElBQUksS0FBSyxDQUFDLE9BQU8sQ0FBQyxtQkFBbUIsQ0FBQztRQUNyQyxNQUFNLDZDQUE2QyxDQUFDO0lBRXJELE1BQU0sZ0JBQWdCLEdB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TSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsVUFBVSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQztTQUN6QyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUM7QUFDYixDQUFDO0FBRUQsU0FBUyxzQkFBc0IsQ0FBQyxPQUFlLEVBQUUsU0FBMkI7SUFDM0UsS0FBSyxNQUFNLENBQUMsUUFBUSxFQUFFLFdBQVcsQ0FBQyxJQUFJLE1BQU0sQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLEVBQUUsQ0FBQztRQUNqRSxPQUFPLEdBQUcsT0FBTyxDQUFDLE9BQU8sQ0FBQyxRQUFRLEVBQUUsV0FBVyxDQUFDLENBQUM7SUFDbEQsQ0FBQztJQUVELE9BQU8sT0FBTyxDQUFDO0FBQ2hCLENBQUM7QUFFRCxTQUFTLHVCQUF1QixDQUFDLE9BQWU7SUFDL0MsTUFBTSxNQUFNLEdBQWtCLEVBQUUsQ0FBQztJQUNqQzs7T0FFRztJQUNILE9BQU8sTUFBTSxDQUFDO0FBQ2YsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IHogfSBmcm9tIFwiem9kXCI7XHJcbmltcG9ydCB7IGVuY29kZSB9IGZyb20gXCJqcy1iYXNlNjRcIjtcclxuaW1wb3J0IHsgRW52aXJvbm1lbnQsIFJlZ2V4U25pcHBldCwgc2VyaWFsaXplU25pcHBldExpa2UsIFNuaXBwZXQsIFN0cmluZ1NuaXBwZXQsIFZJU1VBTF9TTklQUEVUX01BR0lDX1NFTEVDVElPTl9QTEFDRUhPTERFUiwgVmlzdWFsU25pcHBldCB9IGZyb20gXCIuL3NuaXBwZXRzXCI7XHJcbmltcG9ydCB7IE9wdGlvbnMgfSBmcm9tIFwiLi9vcHRpb25zXCI7XHJcbi8vaW1wb3J0IHsgc29ydFNuaXBwZXRzIH0gZnJvbSBcIi4vc29ydFwiO1xyXG4vL2ltcG9ydCB7IEVYQ0xVU0lPTlMsIEVudmlyb25tZW50IH0gZnJvbSBcIi4vZW52aXJvbm1lbnRcIjtcclxuaW1wb3J0IHsgcGFyc2UgfSBmcm9tIFwidmFsaWJvdFwiO1xyXG5cclxuZXhwb3J0IHR5cGUgU25pcHBldFZhcmlhYmxlcyA9IFJlY29yZDxzdHJpbmcsIHN0cmluZz47XHJcblxyXG5hc3luYyBmdW5jdGlvbiBpbXBvcnRSYXcobWF5YmVKYXZhU2NyaXB0Q29kZTogc3RyaW5nKSB7XHJcblx0bGV0IHJhdztcclxuXHR0cnkge1xyXG5cdFx0dHJ5IHtcclxuXHRcdFx0Ly8gZmlyc3QsIHRyeSB0byBpbXBvcnQgYXMgYSBwbGFpbiBqcyBtb2R1bGVcclxuXHRcdFx0Ly8ganMtYmFzZTY0LmVuY29kZSBpcyBuZWVkZWQgb3ZlciBidWlsdGluIGB3aW5kb3cuYnRvYWAgYmVjYXVzZSB0aGUgbGF0dGVyIGVycm9ycyBvbiB1bmljb2RlXHJcblx0XHRcdHJhdyA9IGF3YWl0IGltcG9ydE1vZHVsZURlZmF1bHQoYGRhdGE6dGV4dC9qYXZhc2NyaXB0O2Jhc2U2NCwke2VuY29kZShtYXliZUphdmFTY3JpcHRDb2RlKX1gKTtcclxuXHRcdH0gY2F0Y2gge1xyXG5cdFx0XHQvLyBvdGhlcndpc2UsIHRyeSB0byBpbXBvcnQgYXMgYSBzdGFuZGFsb25lIGpzIG9iamVjdFxyXG5cdFx0XHRyYXcgPSBhd2FpdCBpbXBvcnRNb2R1bGVEZWZhdWx0KGBkYXRhOnRleHQvamF2YXNjcmlwdDtiYXNlNjQsJHtlbmNvZGUoYGV4cG9ydCBkZWZhdWx0ICR7bWF5YmVKYXZhU2NyaXB0Q29kZX1gKX1gKTtcclxuXHRcdH1cclxuXHR9IGNhdGNoIChlKSB7XHJcblx0XHR0aHJvdyBcIkludmFsaWQgZm9ybWF0LlwiO1xyXG5cdH1cclxuXHRyZXR1cm4gcmF3O1xyXG59XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcGFyc2VTbmlwcGV0VmFyaWFibGVzKHNuaXBwZXRWYXJpYWJsZXNTdHI6IHN0cmluZykge1xyXG5cdGNvbnN0IHJhd1NuaXBwZXRWYXJpYWJsZXMgPSBhd2FpdCBpbXBvcnRSYXcoc25pcHBldFZhcmlhYmxlc1N0cikgYXMgU25pcHBldFZhcmlhYmxlcztcclxuXHJcblx0aWYgKEFycmF5LmlzQXJyYXkocmF3U25pcHBldFZhcmlhYmxlcykpXHJcblx0XHR0aHJvdyBcIkNhbm5vdCBwYXJzZSBhbiBhcnJheSBhcyBhIHZhcmlhYmxlcyBvYmplY3RcIjtcclxuXHJcblx0Y29uc3Qgc25pcHBldFZhcmlhYmxlczogU25pcHBldFZhcmlhYmxlcyA9IHt9O1xyXG5cdGZvciAoY29uc3QgW3ZhcmlhYmxlLCB2YWx1ZV0gb2YgT2JqZWN0LmVudHJpZXMocmF3U25pcHBldFZhcmlhYmxlcykpIHtcclxuXHRcdGlmICh2YXJpYWJsZS5zdGFydHNXaXRoKFwiJHtcIikpIHtcclxuXHRcdFx0aWYgKCF2YXJpYWJsZS5lbmRzV2l0aChcIn1cIikpIHtcclxuXHRcdFx0XHR0aHJvdyBgSW52YWxpZCBzbmlwcGV0IHZhcmlhYmxlIG5hbWUgJyR7dmFyaWFibGV9JzogU3RhcnRzIHdpdGggJ1xcJHsnIGJ1dCBkb2VzIG5vdCBlbmQgd2l0aCAnfScuIFlvdSBuZWVkIHRvIGhhdmUgYm90aCBvciBuZWl0aGVyLmA7XHJcblx0XHRcdH1cclxuXHRcdFx0c25pcHBldFZhcmlhYmxlc1t2YXJpYWJsZV0gPSB2YWx1ZTtcclxuXHRcdH0gZWxzZSB7XHJcblx0XHRcdGlmICh2YXJpYWJsZS5lbmRzV2l0aChcIn1cIikpIHtcclxuXHRcdFx0XHR0aHJvdyBgSW52YWxpZCBzbmlwcGV0IHZhcmlhYmxlIG5hbWUgJyR7dmFyaWFibGV9JzogRW5kcyB3aXRoICd9JyBidXQgZG9lcyBub3Qgc3RhcnQgd2l0aCAnXFwkeycuIFlvdSBuZWVkIHRvIGhhdmUgYm90aCBvciBuZWl0aGVyLmA7XHJcblx0XHRcdH1cclxuXHRcdFx0c25pcHBldFZhcmlhYmxlc1tcIiR7XCIgKyB2YXJpYWJsZSArIFwifVwiXSA9IHZhbHVlO1xyXG5cdFx0fVxyXG5cdH1cclxuXHRyZXR1cm4gc25pcHBldFZhcmlhYmxlcztcclxufVxyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHBhcnNlU25pcHBldHMoc25pcHBldHNTdHI6IHN0cmluZywgc25pcHBldFZhcmlhYmxlczogU25pcHBldFZhcmlhYmxlcykge1xyXG5cdGxldCByYXdTbmlwcGV0cyA9IGF3YWl0IGltcG9ydFJhdyhzbmlwcGV0c1N0cikgYXMgUmF3U25pcHBldFtdO1xyXG5cclxuXHRsZXQgcGFyc2VkU25pcHBldHM7XHJcblx0dHJ5IHtcclxuXHRcdC8vIHZhbGlkYXRlIHRoZSBzaGFwZSBvZiB0aGUgcmF3IHNuaXBwZXRzXHJcblx0XHRyYXdTbmlwcGV0cyA9IHZhbGlkYXRlUmF3U25pcHBldHMocmF3U25pcHBldHMpO1xyXG5cclxuXHRcdHBhcnNlZFNuaXBwZXRzID0gcmF3U25pcHBldHMubWFwKChyYXcpID0+IHtcclxuXHRcdFx0dHJ5IHtcclxuXHRcdFx0XHQvLyBOb3JtYWxpemUgdGhlIHJhdyBzbmlwcGV0IGFuZCBjb252ZXJ0IGl0IGludG8gYSBTbmlwcGV0XHJcblx0XHRcdFx0cmV0dXJuIHBhcnNlU25pcHBldChyYXcsIHNuaXBwZXRWYXJpYWJsZXMpO1xyXG5cdFx0XHR9IGNhdGNoIChlKSB7XHJcblx0XHRcdFx0Ly8gcHJvdmlkZSBjb250ZXh0IG9mIHdoaWNoIHNuaXBwZXQgZXJyb3JlZFxyXG5cdFx0XHRcdHRocm93IGAke2V9XFxuRXJyb3Jpbmcgc25pcHBldDpcXG4ke3NlcmlhbGl6ZVNuaXBwZXRMaWtlKHJhdyl9YDtcclxuXHRcdFx0fVxyXG5cdFx0fSk7XHJcblx0fSBjYXRjaChlKSB7XHJcblx0XHR0aHJvdyBgSW52YWxpZCBzbmlwcGV0IGZvcm1hdDogJHtlfWA7XHJcblx0fVxyXG5cclxuXHQvL3BhcnNlZFNuaXBwZXRzID0gc29ydFNuaXBwZXRzKHBhcnNlZFNuaXBwZXRzKTtcclxuXHJcblx0cmV0dXJuIHBhcnNlZFNuaXBwZXRzO1xyXG59XHJcblxyXG4vKiogbG9hZCBzbmlwcGV0IHN0cmluZyBhcyBtb2R1bGUgKi9cclxuXHJcbi8qKlxyXG4gKiBpbXBvcnRzIHRoZSBkZWZhdWx0IGV4cG9ydCBvZiBhIGdpdmVuIG1vZHVsZS5cclxuICpcclxuICogQHBhcmFtIG1vZHVsZSB0aGUgbW9kdWxlIHRvIGltcG9ydC4gdGhpcyBjYW4gYmUgYSByZXNvdXJjZSBwYXRoLCBkYXRhIHVybCwgZXRjXHJcbiAqIEByZXR1cm5zIHRoZSBkZWZhdWx0IGV4cG9ydCBvZiBzYWlkIG1vZHVsZVxyXG4gKiBAdGhyb3dzIGlmIGltcG9ydCBmYWlscyBvciBkZWZhdWx0IGV4cG9ydCBpcyB1bmRlZmluZWRcclxuICovXHJcbmFzeW5jIGZ1bmN0aW9uIGltcG9ydE1vZHVsZURlZmF1bHQobW9kdWxlOiBzdHJpbmcpOiBQcm9taXNlPHVua25vd24+IHtcclxuXHRsZXQgZGF0YTtcclxuXHR0cnkge1xyXG5cdFx0ZGF0YSA9IGF3YWl0IGltcG9ydChtb2R1bGUpO1xyXG5cdH0gY2F0Y2ggKGUpIHtcclxuXHRcdHRocm93IGBmYWlsZWQgdG8gaW1wb3J0IG1vZHVsZSAke21vZHVsZX1gO1xyXG5cdH1cclxuXHJcblx0Ly8gaXQncyBzYWZlIHRvIHVzZSBgaW5gIGhlcmUgLSBpdCBoYXMgYSBudWxsIHByb3RvdHlwZSwgc28gYE9iamVjdC5oYXNPd25Qcm9wZXJ0eWAgaXNuJ3QgYXZhaWxhYmxlLFxyXG5cdC8vIGJ1dCBvbiB0aGUgb3RoZXIgaGFuZCB3ZSBkb24ndCBuZWVkIHRvIHdvcnJ5IGFib3V0IHNvbWV0aGluZyBmdXJ0aGVyIHVwIHRoZSBwcm90b3R5cGUgY2hhaW4gbWVzc2luZyB3aXRoIHRoaXMgY2hlY2tcclxuXHRpZiAoIShcImRlZmF1bHRcIiBpbiBkYXRhKSkge1xyXG5cdFx0dGhyb3cgYE5vIGRlZmF1bHQgZXhwb3J0IHByb3ZpZGVkIGZvciBtb2R1bGUgJHttb2R1bGV9YDtcclxuXHR9XHJcblxyXG5cdHJldHVybiBkYXRhLmRlZmF1bHQ7XHJcbn1cclxuXHJcbi8qKiByYXcgc25pcHBldCBJUiAqL1xyXG5cclxuY29uc3QgUmF3U25pcHBldFNjaGVtYSA9IHoub2JqZWN0KHtcclxuICAgIHRyaWdnZXI6IHoudW5pb24oW3ouc3RyaW5nKCksIHouaW5zdGFuY2VvZihSZWdFeHApXSksXHJcbiAgICByZXBsYWNlbWVudDogei51bmlvbihbei5zdHJpbmcoKSwgei5mdW5jdGlvbigpXSksXHJcbiAgICBvcHRpb25zOiB6LnN0cmluZygpLFxyXG4gICAgZmxhZ3M6IHouc3RyaW5nKCkub3B0aW9uYWwoKSxcclxuICAgIHByaW9yaXR5OiB6Lm51bWJlcigpLm9wdGlvbmFsKCksXHJcbiAgICBkZXNjcmlwdGlvbjogei5zdHJpbmcoKS5vcHRpb25hbCgpLFxyXG4gIH0pO1xyXG5cclxudHlwZSBSYXdTbmlwcGV0ID0gei5pbmZlcjx0eXBlb2YgUmF3U25pcHBldFNjaGVtYT47XHJcblxyXG4vKipcclxuICogdHJpZXMgdG8gcGFyc2UgYW4gdW5rbm93biB2YWx1ZSBhcyBhbiBhcnJheSBvZiByYXcgc25pcHBldHNcclxuICogQHRocm93cyBpZiB0aGUgdmFsdWUgZG9lcyBub3QgYWRoZXJlIHRvIHRoZSByYXcgc25pcHBldCBhcnJheSBzY2hlbWFcclxuICovXHJcbmZ1bmN0aW9uIHZhbGlkYXRlUmF3U25pcHBldHMoc25pcHBldHM6IHVua25vd24pOiBSYXdTbmlwcGV0W10ge1xyXG4gIGlmICghQXJyYXkuaXNBcnJheShzbmlwcGV0cykpIHtcclxuICAgIHRocm93IG5ldyBFcnJvcihcIkV4cGVjdGVkIHNuaXBwZXRzIHRvIGJlIGFuIGFycmF5XCIpO1xyXG4gIH1cclxuXHJcbiAgcmV0dXJuIHNuaXBwZXRzLm1hcCgocmF3LCBpbmRleCkgPT4ge1xyXG4gICAgY29uc3QgdmFsaWRhdGlvblJlc3VsdCA9IFJhd1NuaXBwZXRTY2hlbWEuc2FmZVBhcnNlKHJhdyk7XHJcblxyXG4gICAgaWYgKCF2YWxpZGF0aW9uUmVzdWx0LnN1Y2Nlc3MpIHtcclxuICAgICAgY29uc3QgZXJyb3JNZXNzYWdlID0gdmFsaWRhdGlvblJlc3VsdC5lcnJvci5lcnJvcnNcclxuICAgICAgICAubWFwKChlcnJvcikgPT4gYCR7ZXJyb3IucGF0aC5qb2luKFwiLlwiKX06ICR7ZXJyb3IubWVzc2FnZX1gKVxyXG4gICAgICAgIC5qb2luKFwiLCBcIik7XHJcbiAgICAgIHRocm93IG5ldyBFcnJvcihcclxuICAgICAgICBgVmFsdWUgZG9lcyBub3QgcmVzZW1ibGUgc25pcHBldCBhdCBpbmRleCAke2luZGV4fS5cXG5FcnJvcnM6ICR7ZXJyb3JNZXNzYWdlfVxcbkVycm9yaW5nIHNuaXBwZXQ6XFxuJHtKU09OLnN0cmluZ2lmeShcclxuICAgICAgICAgIHJhdyxcclxuICAgICAgICAgIG51bGwsXHJcbiAgICAgICAgICAyXHJcbiAgICAgICAgKX1gXHJcbiAgICAgICk7XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIHZhbGlkYXRpb25SZXN1bHQuZGF0YTtcclxuICB9KTtcclxufVxyXG5cclxuLyoqXHJcbiAqIFBhcnNlcyBhIHJhdyBzbmlwcGV0LlxyXG4gKiBUaGlzIGRvZXMgdGhlIGZvbGxvd2luZzpcclxuICogLSBzbmlwcGV0IHZhcmlhYmxlcyBhcmUgc3Vic3RpdHV0ZWQgaW50byB0aGUgdHJpZ2dlclxyXG4gKiAtIGBvcHRpb25zLnJlZ2V4YCBhbmQgYG9wdGlvbnMudmlzdWFsYCBhcmUgc2V0IHByb3Blcmx5XHJcbiAqIC0gaWYgaXQgaXMgYSByZWdleCBzbmlwcGV0LCB0aGUgdHJpZ2dlciBpcyByZXByZXNlbnRlZCBhcyBhIFJlZ0V4cCBpbnN0YW5jZSB3aXRoIGZsYWdzIHNldFxyXG4gKi9cclxuZnVuY3Rpb24gcGFyc2VTbmlwcGV0KHJhdzogUmF3U25pcHBldCwgc25pcHBldFZhcmlhYmxlczogU25pcHBldFZhcmlhYmxlcyk6IFNuaXBwZXQge1xyXG5cdGNvbnN0IHsgcmVwbGFjZW1lbnQsIHByaW9yaXR5LCBkZXNjcmlwdGlvbiB9ID0gcmF3O1xyXG5cdGNvbnN0IG9wdGlvbnMgPSBPcHRpb25zLmZyb21Tb3VyY2UocmF3Lm9wdGlvbnMpO1xyXG5cdGxldCB0cmlnZ2VyO1xyXG5cdGxldCBleGNsdWRlZEVudmlyb25tZW50cztcclxuICAgIHJldHVybiBuZXcgU3RyaW5nU25pcHBldCh7dHJpZ2dlcjogJ2NkJyxyZXBsYWNlbWVudDogJ1xcXFxjZG90JyxvcHRpb25zOiBuZXcgT3B0aW9ucygpfSk7XHJcblx0Ly8gd2UgaGF2ZSBhIHJlZ2V4IHNuaXBwZXRcclxuXHRpZiAob3B0aW9ucy5yZWdleCB8fCByYXcudHJpZ2dlciBpbnN0YW5jZW9mIFJlZ0V4cCkge1xyXG5cdFx0bGV0IHRyaWdnZXJTdHI6IHN0cmluZztcclxuXHRcdC8vIG5vcm1hbGl6ZSBmbGFncyB0byBhIHN0cmluZ1xyXG5cdFx0bGV0IGZsYWdzID0gcmF3LmZsYWdzID8/IFwiXCI7XHJcblxyXG5cdFx0Ly8gZXh0cmFjdCB0cmlnZ2VyIHN0cmluZyBmcm9tIHRyaWdnZXIsXHJcblx0XHQvLyBhbmQgbWVyZ2UgZmxhZ3MsIGlmIHRyaWdnZXIgaXMgYSByZWdleHAgYWxyZWFkeVxyXG5cdFx0aWYgKHJhdy50cmlnZ2VyIGluc3RhbmNlb2YgUmVnRXhwKSB7XHJcblx0XHRcdC8vdHJpZ2dlclN0ciA9IHJhdy50cmlnZ2VyLnNvdXJjZTtcclxuXHRcdFx0ZmxhZ3MgPSBgJHsocmF3LnRyaWdnZXIgYXMgUmVnRXhwKS5mbGFnc30ke2ZsYWdzfWA7XHJcblx0XHR9IGVsc2Uge1xyXG5cdFx0XHQvL3RyaWdnZXJTdHIgPSByYXcudHJpZ2dlcjtcclxuXHRcdH1cclxuXHRcdC8vIGZpbHRlciBvdXQgaW52YWxpZCBmbGFnc1xyXG5cdFx0ZmxhZ3MgPSBmaWx0ZXJGbGFncyhmbGFncyk7XHJcblxyXG5cdFx0Ly8gc3Vic3RpdHV0ZSBzbmlwcGV0IHZhcmlhYmxlc1xyXG5cdFx0dHJpZ2dlclN0ciA9IGluc2VydFNuaXBwZXRWYXJpYWJsZXModHJpZ2dlclN0ciwgc25pcHBldFZhcmlhYmxlcyk7XHJcblxyXG5cdFx0Ly8gZ2V0IGV4Y2x1ZGVkIGVudmlyb25tZW50KHMpIGZvciB0aGlzIHRyaWdnZXIsIGlmIGFueVxyXG5cdFx0ZXhjbHVkZWRFbnZpcm9ubWVudHMgPSBnZXRFeGNsdWRlZEVudmlyb25tZW50cyh0cmlnZ2VyU3RyKTtcclxuXHJcblx0XHQvLyBBZGQgJCBzbyByZWdleCBtYXRjaGVzIGVuZCBvZiBzdHJpbmdcclxuXHRcdC8vIGkuZS4gbG9vayBmb3IgYSBtYXRjaCBhdCB0aGUgY3Vyc29yJ3MgY3VycmVudCBwb3NpdGlvblxyXG5cdFx0dHJpZ2dlclN0ciA9IGAke3RyaWdnZXJTdHJ9JGA7XHJcblxyXG5cdFx0Ly8gY29udmVydCB0cmlnZ2VyIGludG8gUmVnRXhwIGluc3RhbmNlXHJcblx0XHR0cmlnZ2VyID0gbmV3IFJlZ0V4cCh0cmlnZ2VyU3RyLCBmbGFncyk7XHJcblxyXG5cdFx0b3B0aW9ucy5yZWdleCA9IHRydWU7XHJcblxyXG5cdFx0Y29uc3Qgbm9ybWFsaXNlZCA9IHsgdHJpZ2dlciwgcmVwbGFjZW1lbnQsIG9wdGlvbnMsIHByaW9yaXR5LCBkZXNjcmlwdGlvbiwgZXhjbHVkZWRFbnZpcm9ubWVudHMgfTtcclxuXHJcblx0XHQvL3JldHVybiBuZXcgUmVnZXhTbmlwcGV0KG5vcm1hbGlzZWQpO1xyXG5cdH1cclxuXHRlbHNlIHtcclxuXHRcdGxldCB0cmlnZ2VyID0gcmF3LnRyaWdnZXIgYXMgc3RyaW5nO1xyXG5cdFx0Ly8gc3Vic3RpdHV0ZSBzbmlwcGV0IHZhcmlhYmxlc1xyXG5cdFx0dHJpZ2dlciA9IGluc2VydFNuaXBwZXRWYXJpYWJsZXModHJpZ2dlciwgc25pcHBldFZhcmlhYmxlcyk7XHJcblxyXG5cdFx0Ly8gZ2V0IGV4Y2x1ZGVkIGVudmlyb25tZW50KHMpIGZvciB0aGlzIHRyaWdnZXIsIGlmIGFueVxyXG5cdFx0ZXhjbHVkZWRFbnZpcm9ubWVudHMgPSBnZXRFeGNsdWRlZEVudmlyb25tZW50cyh0cmlnZ2VyKTtcclxuXHJcblx0XHQvLyBub3JtYWxpemUgdmlzdWFsIHJlcGxhY2VtZW50c1xyXG5cdFx0LyppZiAodHlwZW9mIHJlcGxhY2VtZW50ID09PSBcInN0cmluZ1wiICYmIHJlcGxhY2VtZW50LmluY2x1ZGVzKFZJU1VBTF9TTklQUEVUX01BR0lDX1NFTEVDVElPTl9QTEFDRUhPTERFUikpIHtcclxuXHRcdFx0b3B0aW9ucy52aXN1YWwgPSB0cnVlO1xyXG5cdFx0fSovXHJcblxyXG5cdFx0Y29uc3Qgbm9ybWFsaXNlZCA9IHsgdHJpZ2dlciwgcmVwbGFjZW1lbnQsIG9wdGlvbnMsIHByaW9yaXR5LCBkZXNjcmlwdGlvbiwgZXhjbHVkZWRFbnZpcm9ubWVudHMgfTtcclxuXHJcblx0XHRpZiAob3B0aW9ucy52aXN1YWwpIHtcclxuXHRcdFx0Ly9yZXR1cm4gbmV3IFZpc3VhbFNuaXBwZXQobm9ybWFsaXNlZCk7XHJcblx0XHR9XHJcblx0XHRlbHNlIHtcclxuXHRcdFx0Ly9yZXR1cm4gbmV3IFN0cmluZ1NuaXBwZXQobm9ybWFsaXNlZCk7XHJcblx0XHR9XHJcblx0fVxyXG59XHJcblxyXG4vKipcclxuICogcmVtb3ZlcyBkdXBsaWNhdGUgZmxhZ3MgYW5kIGZpbHRlcnMgb3V0IGludmFsaWQgb25lcyBmcm9tIGEgZmxhZ3Mgc3RyaW5nLlxyXG4gKi9cclxuZnVuY3Rpb24gZmlsdGVyRmxhZ3MoZmxhZ3M6IHN0cmluZyk6IHN0cmluZyB7XHJcblx0Ly8gZmlsdGVyIG91dCBpbnZhbGlkIGZsYWdzXHJcblx0Y29uc3QgdmFsaWRGbGFncyA9IFtcclxuXHRcdC8vIFwiZFwiLCAvLyBkb2Vzbid0IGFmZmVjdCB0aGUgc2VhcmNoXHJcblx0XHQvLyBcImdcIiwgLy8gZG9lc24ndCBhZmZlY3QgdGhlIHBhdHRlcm4gbWF0Y2ggYW5kIGlzIGFsbW9zdCBjZXJ0YWlubHkgdW5kZXNpcmVkIGJlaGF2aW9yXHJcblx0XHRcImlcIixcclxuXHRcdFwibVwiLFxyXG5cdFx0XCJzXCIsXHJcblx0XHRcInVcIixcclxuXHRcdFwidlwiLFxyXG5cdFx0Ly8gXCJ5XCIsIC8vIGFsbW9zdCBjZXJ0YWlubHkgdW5kZXNpcmVkIGJlaGF2aW9yXHJcblx0XTtcclxuXHRyZXR1cm4gQXJyYXkuZnJvbShuZXcgU2V0KGZsYWdzLnNwbGl0KFwiXCIpKSlcclxuXHRcdFx0LmZpbHRlcihmbGFnID0+IHZhbGlkRmxhZ3MuaW5jbHVkZXMoZmxhZykpXHJcblx0XHRcdC5qb2luKFwiXCIpO1xyXG59XHJcblxyXG5mdW5jdGlvbiBpbnNlcnRTbmlwcGV0VmFyaWFibGVzKHRyaWdnZXI6IHN0cmluZywgdmFyaWFibGVzOiBTbmlwcGV0VmFyaWFibGVzKSB7XHJcblx0Zm9yIChjb25zdCBbdmFyaWFibGUsIHJlcGxhY2VtZW50XSBvZiBPYmplY3QuZW50cmllcyh2YXJpYWJsZXMpKSB7XHJcblx0XHR0cmlnZ2VyID0gdHJpZ2dlci5yZXBsYWNlKHZhcmlhYmxlLCByZXBsYWNlbWVudCk7XHJcblx0fVxyXG5cclxuXHRyZXR1cm4gdHJpZ2dlcjtcclxufVxyXG5cclxuZnVuY3Rpb24gZ2V0RXhjbHVkZWRFbnZpcm9ubWVudHModHJpZ2dlcjogc3RyaW5nKTogRW52aXJvbm1lbnRbXSB7XHJcblx0Y29uc3QgcmVzdWx0OiBFbnZpcm9ubWVudFtdID0gW107XHJcblx0LyppZiAoRVhDTFVTSU9OUy5oYXNPd25Qcm9wZXJ0eSh0cmlnZ2VyKSkge1xyXG5cdFx0cmVzdWx0LnB1c2goRVhDTFVTSU9OU1t0cmlnZ2VyXSk7XHJcblx0fSovXHJcblx0cmV0dXJuIHJlc3VsdDtcclxufVxyXG4iXX0=