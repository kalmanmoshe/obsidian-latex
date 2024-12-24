/**
 * in visual snippets, if the replacement is a string, this is the magic substring to indicate the selection.
 */
export const VISUAL_SNIPPET_MAGIC_SELECTION_PLACEHOLDER = "${VISUAL}";
/**
 * a snippet instance contains all the information necessary to run a snippet.
 * snippet data specific to a certain type of snippet is in its `data` property.
 */
export class Snippet {
    type;
    data;
    options;
    priority;
    description;
    excludedEnvironments;
    constructor(type, trigger, replacement, options, priority, description, excludedEnvironments) {
        this.type = type;
        // @ts-ignore
        this.data = { trigger, replacement };
        this.options = options;
        this.priority = priority;
        this.description = description;
        this.excludedEnvironments = excludedEnvironments ?? [];
    }
    // we need to explicitly type the return value here so the derived classes,
    // have the getter typed properly for the particular <T> the derived class extends
    get trigger() { return this.data.trigger; }
    get replacement() { return this.data.replacement; }
    toString() {
        return serializeSnippetLike({
            type: this.type,
            trigger: this.trigger,
            replacement: this.replacement,
            options: this.options,
            priority: this.priority,
            description: this.description,
            excludedEnvironments: this.excludedEnvironments,
        });
    }
}
export class VisualSnippet extends Snippet {
    constructor({ trigger, replacement, options, priority, description, excludedEnvironments }) {
        super("visual", trigger, replacement, options, priority, description, excludedEnvironments);
    }
    process(effectiveLine, range, sel) {
        const hasSelection = !!sel;
        // visual snippets only run when there is a selection
        if (!hasSelection) {
            return null;
        }
        // check whether the trigger text was typed
        if (!(effectiveLine.endsWith(this.trigger))) {
            return null;
        }
        const triggerPos = range.from;
        let replacement;
        if (typeof this.replacement === "string") {
            replacement = this.replacement.replace(VISUAL_SNIPPET_MAGIC_SELECTION_PLACEHOLDER, sel);
        }
        else {
            replacement = this.replacement(sel);
            // sanity check - if this.replacement was a function,
            // we have no way to validate beforehand that it really does return a string
            if (typeof replacement !== "string") {
                return null;
            }
        }
        return { triggerPos, replacement };
    }
}
export class RegexSnippet extends Snippet {
    constructor({ trigger, replacement, options, priority, description, excludedEnvironments }) {
        super("regex", trigger, replacement, options, priority, description, excludedEnvironments);
    }
    process(effectiveLine, range, sel) {
        const hasSelection = !!sel;
        // non-visual snippets only run when there is no selection
        if (hasSelection) {
            return null;
        }
        const result = this.trigger.exec(effectiveLine);
        if (result === null) {
            return null;
        }
        const triggerPos = result.index;
        let replacement;
        if (typeof this.replacement === "string") {
            // Compute the replacement string
            // result.length - 1 = the number of capturing groups
            const nCaptureGroups = result.length - 1;
            replacement = Array.from({ length: nCaptureGroups })
                .map((_, i) => i + 1)
                .reduce((replacement, i) => replacement.replaceAll(`[[${i - 1}]]`, result[i]), this.replacement);
        }
        else {
            replacement = this.replacement(result);
            // sanity check - if this.replacement was a function,
            // we have no way to validate beforehand that it really does return a string
            if (typeof replacement !== "string") {
                return null;
            }
        }
        return { triggerPos, replacement };
    }
}
export class StringSnippet extends Snippet {
    constructor({ trigger, replacement, options, priority, description, excludedEnvironments: excludeIn }) {
        super("string", trigger, replacement, options, priority, description, excludeIn);
    }
    process(effectiveLine, range, sel) {
        const hasSelection = !!sel;
        // non-visual snippets only run when there is no selection
        if (hasSelection) {
            return null;
        }
        // Check whether the trigger text was typed
        if (!(effectiveLine.endsWith(this.trigger))) {
            return null;
        }
        const triggerPos = effectiveLine.length - this.trigger.length;
        const replacement = typeof this.replacement === "string"
            ? this.replacement
            : this.replacement(this.trigger);
        // sanity check - if replacement was a function,
        // we have no way to validate beforehand that it really does return a string
        if (typeof replacement !== "string") {
            return null;
        }
        return { triggerPos, replacement };
    }
}
/**
 * replacer function for serializing snippets
 * @param k
 * @param v
 * @returns
 */
function replacer(k, v) {
    if (typeof v === "function") {
        return "[[Function]]";
    }
    if (v instanceof RegExp) {
        return `[[RegExp]]: ${v.toString()}`;
    }
    return v;
}
/**
 * serialize a snippet-like object.
 */
export function serializeSnippetLike(snippetLike) {
    return JSON.stringify(snippetLike, replacer, 2);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic25pcHBldHMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvc25pcHBldHMvc25pcHBldHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBSUE7O0dBRUc7QUFDSCxNQUFNLENBQUMsTUFBTSwwQ0FBMEMsR0FBRyxXQUFXLENBQUM7QUF1Q3RFOzs7R0FHRztBQUNILE1BQU0sT0FBZ0IsT0FBTztJQUM1QixJQUFJLENBQUk7SUFDUixJQUFJLENBQWlCO0lBQ3JCLE9BQU8sQ0FBVTtJQUNqQixRQUFRLENBQVU7SUFDbEIsV0FBVyxDQUFVO0lBRXJCLG9CQUFvQixDQUFnQjtJQUVwQyxZQUNDLElBQU8sRUFDUCxPQUFrQyxFQUNsQyxXQUEwQyxFQUMxQyxPQUFnQixFQUNoQixRQUE2QixFQUM3QixXQUFnQyxFQUNoQyxvQkFBb0M7UUFFcEMsSUFBSSxDQUFDLElBQUksR0FBRyxJQUFJLENBQUM7UUFDakIsYUFBYTtRQUNiLElBQUksQ0FBQyxJQUFJLEdBQUcsRUFBRSxPQUFPLEVBQUUsV0FBVyxFQUFFLENBQUM7UUFDckMsSUFBSSxDQUFDLE9BQU8sR0FBRyxPQUFPLENBQUM7UUFDdkIsSUFBSSxDQUFDLFFBQVEsR0FBRyxRQUFRLENBQUM7UUFDekIsSUFBSSxDQUFDLFdBQVcsR0FBRyxXQUFXLENBQUM7UUFDL0IsSUFBSSxDQUFDLG9CQUFvQixHQUFHLG9CQUFvQixJQUFJLEVBQUUsQ0FBQztJQUN4RCxDQUFDO0lBRUQsMkVBQTJFO0lBQzNFLGtGQUFrRjtJQUNsRixJQUFJLE9BQU8sS0FBZ0MsT0FBTyxJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUM7SUFDdEUsSUFBSSxXQUFXLEtBQW9DLE9BQU8sSUFBSSxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDO0lBSWxGLFFBQVE7UUFDUCxPQUFPLG9CQUFvQixDQUFDO1lBQzNCLElBQUksRUFBRSxJQUFJLENBQUMsSUFBSTtZQUNmLE9BQU8s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dGlvblJhbmdlIH0gZnJvbSBcIkBjb2RlbWlycm9yL3N0YXRlXCI7XG5pbXBvcnQgeyBPcHRpb25zIH0gZnJvbSBcIi4vb3B0aW9uc1wiO1xuaW1wb3J0IHsgRW52aXJvbm1lbnQgfSBmcm9tIFwiLi9lbnZpcm9ubWVudFwiO1xuXG4vKipcbiAqIGluIHZpc3VhbCBzbmlwcGV0cywgaWYgdGhlIHJlcGxhY2VtZW50IGlzIGEgc3RyaW5nLCB0aGlzIGlzIHRoZSBtYWdpYyBzdWJzdHJpbmcgdG8gaW5kaWNhdGUgdGhlIHNlbGVjdGlvbi5cbiAqL1xuZXhwb3J0IGNvbnN0IFZJU1VBTF9TTklQUEVUX01BR0lDX1NFTEVDVElPTl9QTEFDRUhPTERFUiA9IFwiJHtWSVNVQUx9XCI7XG5cbi8qKlxuICogdGhlcmUgYXJlIDMgZGlzdGluY3QgdHlwZXMgb2Ygc25pcHBldHM6XG4gKlxuICogYHZpc3VhbGAgc25pcHBldHMgb25seSB0cmlnZ2VyIG9uIHRleHQgc2VsZWN0aW9ucy5cbiAqIHZpc3VhbCBzbmlwcGV0cyBzdXBwb3J0IG9ubHkgKHNpbmdsZS1jaGFyYWN0ZXIpIHN0cmluZyB0cmlnZ2VycywgYW5kIHN0cmluZyBvciBmdW5jdGlvbiByZXBsYWNlbWVudHMuXG4gKiB2aXN1YWwgcmVwbGFjZW1lbnQgZnVuY3Rpb25zIHRha2UgaW4gdGhlIHRleHQgc2VsZWN0aW9uIGFuZCByZXR1cm4gYSBzdHJpbmcsIG9yIGBmYWxzZWAgdG8gaW5kaWNhdGUgdG8gYWN0dWFsbHkgbm90IGRvIGFueXRoaW5nLlxuICpcbiAqIGByZWdleGAgc25pcHBldHMgc3VwcG9ydCBzdHJpbmcgKHdpdGggdGhlIFwiclwiIHJhdyBvcHRpb24gc2V0KSBvciByZWdleCB0cmlnZ2VycywgYW5kIHN0cmluZyBvciBmdW5jdGlvbiByZXBsYWNlbWVudHMuXG4gKiByZWdleCByZXBsYWNlbWVudCBmdW5jdGlvbnMgdGFrZSBpbiB0aGUgcmVnZXggbWF0Y2ggYW5kIHJldHVybiBhIHN0cmluZy5cbiAqXG4gKiBgc3RyaW5nYCBzbmlwcGV0cyBzdXBwb3J0IHN0cmluZyB0cmlnZ2VycyAod2hlbiBubyBcInJcIiByYXcgb3B0aW9uIHNldCksIGFuZCBzdHJpbmcgb3IgZnVuY3Rpb24gcmVwbGFjZW1lbnRzLlxuICogc3RyaW5nIHJlcGxhY2VtZW50IGZ1bmN0aW9ucyB0YWtlIGluIHRoZSBtYXRjaGVkIHN0cmluZyBhbmQgcmV0dXJuIGEgc3RyaW5nLlxuICovXG5leHBvcnQgdHlwZSBTbmlwcGV0VHlwZSA9XG5cdHwgXCJ2aXN1YWxcIlxuXHR8IFwicmVnZXhcIlxuXHR8IFwic3RyaW5nXCJcblxuZXhwb3J0IHR5cGUgU25pcHBldERhdGE8VCBleHRlbmRzIFNuaXBwZXRUeXBlPiA9IHtcblx0dmlzdWFsOiB7XG5cdFx0dHJpZ2dlcjogc3RyaW5nO1xuXHRcdHJlcGxhY2VtZW50OiBzdHJpbmcgfCAoKHNlbGVjdGlvbjogc3RyaW5nKSA9PiBzdHJpbmcgfCBmYWxzZSk7XG5cdH07XG5cdHJlZ2V4OiB7XG5cdFx0dHJpZ2dlcjogUmVnRXhwO1xuXHRcdHJlcGxhY2VtZW50OiBzdHJpbmcgfCAoKG1hdGNoOiBSZWdFeHBFeGVjQXJyYXkpID0+IHN0cmluZyk7XG5cdH07XG5cdHN0cmluZzoge1xuXHRcdHRyaWdnZXI6IHN0cmluZztcblx0XHRyZXBsYWNlbWVudDogc3RyaW5nIHwgKChtYXRjaDogc3RyaW5nKSA9PiBzdHJpbmcpO1xuXHR9O1xufVtUXVxuXG5leHBvcnQgdHlwZSBQcm9jZXNzU25pcHBldFJlc3VsdCA9XG5cdHwgeyB0cmlnZ2VyUG9zOiBudW1iZXIsIHJlcGxhY2VtZW50OiBzdHJpbmcgfVxuXHR8IG51bGxcblxuLyoqXG4gKiBhIHNuaXBwZXQgaW5zdGFuY2UgY29udGFpbnMgYWxsIHRoZSBpbmZvcm1hdGlvbiBuZWNlc3NhcnkgdG8gcnVuIGEgc25pcHBldC5cbiAqIHNuaXBwZXQgZGF0YSBzcGVjaWZpYyB0byBhIGNlcnRhaW4gdHlwZSBvZiBzbmlwcGV0IGlzIGluIGl0cyBgZGF0YWAgcHJvcGVydHkuXG4gKi9cbmV4cG9ydCBhYnN0cmFjdCBjbGFzcyBTbmlwcGV0PFQgZXh0ZW5kcyBTbmlwcGV0VHlwZSA9IFNuaXBwZXRUeXBlPiB7XG5cdHR5cGU6IFQ7XG5cdGRhdGE6IFNuaXBwZXREYXRhPFQ+O1xuXHRvcHRpb25zOiBPcHRpb25zO1xuXHRwcmlvcml0eT86IG51bWJlcjtcblx0ZGVzY3JpcHRpb24/OiBzdHJpbmc7XG5cblx0ZXhjbHVkZWRFbnZpcm9ubWVudHM6IEVudmlyb25tZW50W107XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0dHlwZTogVCxcblx0XHR0cmlnZ2VyOiBTbmlwcGV0RGF0YTxUPltcInRyaWdnZXJcIl0sXG5cdFx0cmVwbGFjZW1lbnQ6IFNuaXBwZXREYXRhPFQ+W1wicmVwbGFjZW1lbnRcIl0sXG5cdFx0b3B0aW9uczogT3B0aW9ucyxcblx0XHRwcmlvcml0eT86IG51bWJlciB8IHVuZGVmaW5lZCxcblx0XHRkZXNjcmlwdGlvbj86IHN0cmluZyB8IHVuZGVmaW5lZCxcblx0XHRleGNsdWRlZEVudmlyb25tZW50cz86IEVudmlyb25tZW50W10sXG5cdCkge1xuXHRcdHRoaXMudHlwZSA9IHR5cGU7XG5cdFx0Ly8gQHRzLWlnbm9yZVxuXHRcdHRoaXMuZGF0YSA9IHsgdHJpZ2dlciwgcmVwbGFjZW1lbnQgfTtcblx0XHR0aGlzLm9wdGlvbnMgPSBvcHRpb25zO1xuXHRcdHRoaXMucHJpb3JpdHkgPSBwcmlvcml0eTtcblx0XHR0aGlzLmRlc2NyaXB0aW9uID0gZGVzY3JpcHRpb247XG5cdFx0dGhpcy5leGNsdWRlZEVudmlyb25tZW50cyA9IGV4Y2x1ZGVkRW52aXJvbm1lbnRzID8/IFtdO1xuXHR9XG5cblx0Ly8gd2UgbmVlZCB0byBleHBsaWNpdGx5IHR5cGUgdGhlIHJldHVybiB2YWx1ZSBoZXJlIHNvIHRoZSBkZXJpdmVkIGNsYXNzZXMsXG5cdC8vIGhhdmUgdGhlIGdldHRlciB0eXBlZCBwcm9wZXJseSBmb3IgdGhlIHBhcnRpY3VsYXIgPFQ+IHRoZSBkZXJpdmVkIGNsYXNzIGV4dGVuZHNcblx0Z2V0IHRyaWdnZXIoKTogU25pcHBldERhdGE8VD5bXCJ0cmlnZ2VyXCJdIHsgcmV0dXJuIHRoaXMuZGF0YS50cmlnZ2VyOyB9XG5cdGdldCByZXBsYWNlbWVudCgpOiBTbmlwcGV0RGF0YTxUPltcInJlcGxhY2VtZW50XCJdIHsgcmV0dXJuIHRoaXMuZGF0YS5yZXBsYWNlbWVudDsgfVxuXG5cdGFic3RyYWN0IHByb2Nlc3MoZWZmZWN0aXZlTGluZTogc3RyaW5nLCByYW5nZTogU2VsZWN0aW9uUmFuZ2UsIHNlbDogc3RyaW5nKTogUHJvY2Vzc1NuaXBwZXRSZXN1bHQ7XG5cblx0dG9TdHJpbmcoKSB7XG5cdFx0cmV0dXJuIHNlcmlhbGl6ZVNuaXBwZXRMaWtlKHtcblx0XHRcdHR5cGU6IHRoaXMudHlwZSxcblx0XHRcdHRyaWdnZXI6IHRoaXMudHJpZ2dlcixcblx0XHRcdHJlcGxhY2VtZW50OiB0aGlzLnJlcGxhY2VtZW50LFxuXHRcdFx0b3B0aW9uczogdGhpcy5vcHRpb25zLFxuXHRcdFx0cHJpb3JpdHk6IHRoaXMucHJpb3JpdHksXG5cdFx0XHRkZXNjcmlwdGlvbjogdGhpcy5kZXNjcmlwdGlvbixcblx0XHRcdGV4Y2x1ZGVkRW52aXJvbm1lbnRzOiB0aGlzLmV4Y2x1ZGVkRW52aXJvbm1lbnRzLFxuXHRcdH0pO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBWaXN1YWxTbmlwcGV0IGV4dGVuZHMgU25pcHBldDxcInZpc3VhbFwiPiB7XG5cdGNvbnN0cnVjdG9yKHsgdHJpZ2dlciwgcmVwbGFjZW1lbnQsIG9wdGlvbnMsIHByaW9yaXR5LCBkZXNjcmlwdGlvbiwgZXhjbHVkZWRFbnZpcm9ubWVudHMgfTogQ3JlYXRlU25pcHBldDxcInZpc3VhbFwiPikge1xuXHRcdHN1cGVyKFwidmlzdWFsXCIsIHRyaWdnZXIsIHJlcGxhY2VtZW50LCBvcHRpb25zLCBwcmlvcml0eSwgZGVzY3JpcHRpb24sIGV4Y2x1ZGVkRW52aXJvbm1lbnRzKTtcblx0fVxuXG5cdHByb2Nlc3MoZWZmZWN0aXZlTGluZTogc3RyaW5nLCByYW5nZTogU2VsZWN0aW9uUmFuZ2UsIHNlbDogc3RyaW5nKTogUHJvY2Vzc1NuaXBwZXRSZXN1bHQge1xuXHRcdGNvbnN0IGhhc1NlbGVjdGlvbiA9ICEhc2VsO1xuXHRcdC8vIHZpc3VhbCBzbmlwcGV0cyBvbmx5IHJ1biB3aGVuIHRoZXJlIGlzIGEgc2VsZWN0aW9uXG5cdFx0aWYgKCFoYXNTZWxlY3Rpb24pIHsgcmV0dXJuIG51bGw7IH1cblxuXHRcdC8vIGNoZWNrIHdoZXRoZXIgdGhlIHRyaWdnZXIgdGV4dCB3YXMgdHlwZWRcblx0XHRpZiAoIShlZmZlY3RpdmVMaW5lLmVuZHNXaXRoKHRoaXMudHJpZ2dlcikpKSB7IHJldHVybiBudWxsOyB9XG5cblx0XHRjb25zdCB0cmlnZ2VyUG9zID0gcmFuZ2UuZnJvbTtcblx0XHRsZXQgcmVwbGFjZW1lbnQ7XG5cdFx0aWYgKHR5cGVvZiB0aGlzLnJlcGxhY2VtZW50ID09PSBcInN0cmluZ1wiKSB7XG5cdFx0XHRyZXBsYWNlbWVudCA9IHRoaXMucmVwbGFjZW1lbnQucmVwbGFjZShWSVNVQUxfU05JUFBFVF9NQUdJQ19TRUxFQ1RJT05fUExBQ0VIT0xERVIsIHNlbCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJlcGxhY2VtZW50ID0gdGhpcy5yZXBsYWNlbWVudChzZWwpO1xuXG5cdFx0XHQvLyBzYW5pdHkgY2hlY2sgLSBpZiB0aGlzLnJlcGxhY2VtZW50IHdhcyBhIGZ1bmN0aW9uLFxuXHRcdFx0Ly8gd2UgaGF2ZSBubyB3YXkgdG8gdmFsaWRhdGUgYmVmb3JlaGFuZCB0aGF0IGl0IHJlYWxseSBkb2VzIHJldHVybiBhIHN0cmluZ1xuXHRcdFx0aWYgKHR5cGVvZiByZXBsYWNlbWVudCAhPT0gXCJzdHJpbmdcIikgeyByZXR1cm4gbnVsbDsgfVxuXHRcdH1cblxuXHRcdHJldHVybiB7IHRyaWdnZXJQb3MsIHJlcGxhY2VtZW50IH07XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFJlZ2V4U25pcHBldCBleHRlbmRzIFNuaXBwZXQ8XCJyZWdleFwiPiB7XG5cblx0Y29uc3RydWN0b3IoeyB0cmlnZ2VyLCByZXBsYWNlbWVudCwgb3B0aW9ucywgcHJpb3JpdHksIGRlc2NyaXB0aW9uLCBleGNsdWRlZEVudmlyb25tZW50cyB9OiBDcmVhdGVTbmlwcGV0PFwicmVnZXhcIj4pIHtcblx0XHRzdXBlcihcInJlZ2V4XCIsIHRyaWdnZXIsIHJlcGxhY2VtZW50LCBvcHRpb25zLCBwcmlvcml0eSwgZGVzY3JpcHRpb24sIGV4Y2x1ZGVkRW52aXJvbm1lbnRzKTtcblx0fVxuXG5cdHByb2Nlc3MoZWZmZWN0aXZlTGluZTogc3RyaW5nLCByYW5nZTogU2VsZWN0aW9uUmFuZ2UsIHNlbDogc3RyaW5nKTogUHJvY2Vzc1NuaXBwZXRSZXN1bHQge1xuXHRcdGNvbnN0IGhhc1NlbGVjdGlvbiA9ICEhc2VsO1xuXHRcdC8vIG5vbi12aXN1YWwgc25pcHBldHMgb25seSBydW4gd2hlbiB0aGVyZSBpcyBubyBzZWxlY3Rpb25cblx0XHRpZiAoaGFzU2VsZWN0aW9uKSB7IHJldHVybiBudWxsOyB9XG5cblx0XHRjb25zdCByZXN1bHQgPSB0aGlzLnRyaWdnZXIuZXhlYyhlZmZlY3RpdmVMaW5lKTtcblx0XHRpZiAocmVzdWx0ID09PSBudWxsKSB7IHJldHVybiBudWxsOyB9XG5cblx0XHRjb25zdCB0cmlnZ2VyUG9zID0gcmVzdWx0LmluZGV4O1xuXG5cdFx0bGV0IHJlcGxhY2VtZW50O1xuXHRcdGlmICh0eXBlb2YgdGhpcy5yZXBsYWNlbWVudCA9PT0gXCJzdHJpbmdcIikge1xuXHRcdFx0Ly8gQ29tcHV0ZSB0aGUgcmVwbGFjZW1lbnQgc3RyaW5nXG5cdFx0XHQvLyByZXN1bHQubGVuZ3RoIC0gMSA9IHRoZSBudW1iZXIgb2YgY2FwdHVyaW5nIGdyb3Vwc1xuXG5cdFx0XHRjb25zdCBuQ2FwdHVyZUdyb3VwcyA9IHJlc3VsdC5sZW5ndGggLSAxO1xuXHRcdFx0cmVwbGFjZW1lbnQgPSBBcnJheS5mcm9tKHsgbGVuZ3RoOiBuQ2FwdHVyZUdyb3VwcyB9KVxuXHRcdFx0XHQubWFwKChfLCBpKSA9PiBpICsgMSlcblx0XHRcdFx0LnJlZHVjZShcblx0XHRcdFx0XHQocmVwbGFjZW1lbnQsIGkpID0+IHJlcGxhY2VtZW50LnJlcGxhY2VBbGwoYFtbJHtpIC0gMX1dXWAsIHJlc3VsdFtpXSksXG5cdFx0XHRcdFx0dGhpcy5yZXBsYWNlbWVudFxuXHRcdFx0XHQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXBsYWNlbWVudCA9IHRoaXMucmVwbGFjZW1lbnQocmVzdWx0KTtcblxuXHRcdFx0Ly8gc2FuaXR5IGNoZWNrIC0gaWYgdGhpcy5yZXBsYWNlbWVudCB3YXMgYSBmdW5jdGlvbixcblx0XHRcdC8vIHdlIGhhdmUgbm8gd2F5IHRvIHZhbGlkYXRlIGJlZm9yZWhhbmQgdGhhdCBpdCByZWFsbHkgZG9lcyByZXR1cm4gYSBzdHJpbmdcblx0XHRcdGlmICh0eXBlb2YgcmVwbGFjZW1lbnQgIT09IFwic3RyaW5nXCIpIHsgcmV0dXJuIG51bGw7IH1cblx0XHR9XG5cblx0XHRyZXR1cm4geyB0cmlnZ2VyUG9zLCByZXBsYWNlbWVudCB9O1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBTdHJpbmdTbmlwcGV0IGV4dGVuZHMgU25pcHBldDxcInN0cmluZ1wiPiB7XG5cdGRlY2xhcmUgZGF0YTogU25pcHBldERhdGE8XCJzdHJpbmdcIj47XG5cblx0Y29uc3RydWN0b3IoeyB0cmlnZ2VyLCByZXBsYWNlbWVudCwgb3B0aW9ucywgcHJpb3JpdHksIGRlc2NyaXB0aW9uLCBleGNsdWRlZEVudmlyb25tZW50czogZXhjbHVkZUluIH06IENyZWF0ZVNuaXBwZXQ8XCJzdHJpbmdcIj4pIHtcblx0XHRzdXBlcihcInN0cmluZ1wiLCB0cmlnZ2VyLCByZXBsYWNlbWVudCwgb3B0aW9ucywgcHJpb3JpdHksIGRlc2NyaXB0aW9uLCBleGNsdWRlSW4pO1xuXHR9XG5cblx0cHJvY2VzcyhlZmZlY3RpdmVMaW5lOiBzdHJpbmcsIHJhbmdlOiBTZWxlY3Rpb25SYW5nZSwgc2VsOiBzdHJpbmcpOiBQcm9jZXNzU25pcHBldFJlc3VsdCB7XG5cdFx0Y29uc3QgaGFzU2VsZWN0aW9uID0gISFzZWw7XG5cdFx0Ly8gbm9uLXZpc3VhbCBzbmlwcGV0cyBvbmx5IHJ1biB3aGVuIHRoZXJlIGlzIG5vIHNlbGVjdGlvblxuXHRcdGlmIChoYXNTZWxlY3Rpb24pIHsgcmV0dXJuIG51bGw7IH1cblxuXHRcdC8vIENoZWNrIHdoZXRoZXIgdGhlIHRyaWdnZXIgdGV4dCB3YXMgdHlwZWRcblx0XHRpZiAoIShlZmZlY3RpdmVMaW5lLmVuZHNXaXRoKHRoaXMudHJpZ2dlcikpKSB7IHJldHVybiBudWxsOyB9XG5cblx0XHRjb25zdCB0cmlnZ2VyUG9zID0gZWZmZWN0aXZlTGluZS5sZW5ndGggLSB0aGlzLnRyaWdnZXIubGVuZ3RoO1xuXHRcdGNvbnN0IHJlcGxhY2VtZW50ID0gdHlwZW9mIHRoaXMucmVwbGFjZW1lbnQgPT09IFwic3RyaW5nXCJcblx0XHRcdD8gdGhpcy5yZXBsYWNlbWVudFxuXHRcdFx0OiB0aGlzLnJlcGxhY2VtZW50KHRoaXMudHJpZ2dlcik7XG5cblx0XHQvLyBzYW5pdHkgY2hlY2sgLSBpZiByZXBsYWNlbWVudCB3YXMgYSBmdW5jdGlvbixcblx0XHQvLyB3ZSBoYXZlIG5vIHdheSB0byB2YWxpZGF0ZSBiZWZvcmVoYW5kIHRoYXQgaXQgcmVhbGx5IGRvZXMgcmV0dXJuIGEgc3RyaW5nXG5cdFx0aWYgKHR5cGVvZiByZXBsYWNlbWVudCAhPT0gXCJzdHJpbmdcIikgeyByZXR1cm4gbnVsbDsgfVxuXG5cdFx0cmV0dXJuIHsgdHJpZ2dlclBvcywgcmVwbGFjZW1lbnQgfTtcblx0fVxufVxuXG4vKipcbiAqIHJlcGxhY2VyIGZ1bmN0aW9uIGZvciBzZXJpYWxpemluZyBzbmlwcGV0c1xuICogQHBhcmFtIGtcbiAqIEBwYXJhbSB2XG4gKiBAcmV0dXJuc1xuICovXG5mdW5jdGlvbiByZXBsYWNlcihrOiBzdHJpbmcsIHY6IHVua25vd24pIHtcblx0aWYgKHR5cGVvZiB2ID09PSBcImZ1bmN0aW9uXCIpIHsgcmV0dXJuIFwiW1tGdW5jdGlvbl1dXCI7IH1cblx0aWYgKHYgaW5zdGFuY2VvZiBSZWdFeHApIHsgcmV0dXJuIGBbW1JlZ0V4cF1dOiAke3YudG9TdHJpbmcoKX1gOyB9XG5cdHJldHVybiB2O1xufVxuXG50eXBlIENyZWF0ZVNuaXBwZXQ8VCBleHRlbmRzIFNuaXBwZXRUeXBlPiA9IHtcblx0b3B0aW9uczogT3B0aW9ucztcblx0cHJpb3JpdHk/OiBudW1iZXI7XG5cdGRlc2NyaXB0aW9uPzogc3RyaW5nO1xuXHRleGNsdWRlZEVudmlyb25tZW50cz86IEVudmlyb25tZW50W107XG59ICYgU25pcHBldERhdGE8VD5cblxuXG4vKipcbiAqIHNlcmlhbGl6ZSBhIHNuaXBwZXQtbGlrZSBvYmplY3QuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzZXJpYWxpemVTbmlwcGV0TGlrZShzbmlwcGV0TGlrZTogdW5rbm93bikge1xuXHRyZXR1cm4gSlNPTi5zdHJpbmdpZnkoc25pcHBldExpa2UsIHJlcGxhY2VyLCAyKTtcbn0iXX0=