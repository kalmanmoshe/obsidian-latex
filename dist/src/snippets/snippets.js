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
    data;
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic25pcHBldHMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvc25pcHBldHMvc25pcHBldHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBSUE7O0dBRUc7QUFDSCxNQUFNLENBQUMsTUFBTSwwQ0FBMEMsR0FBRyxXQUFXLENBQUM7QUF1Q3RFOzs7R0FHRztBQUNILE1BQU0sT0FBZ0IsT0FBTztJQUM1QixJQUFJLENBQUk7SUFDUixJQUFJLENBQWlCO0lBQ3JCLE9BQU8sQ0FBVTtJQUNqQixRQUFRLENBQVU7SUFDbEIsV0FBVyxDQUFVO0lBRXJCLG9CQUFvQixDQUFnQjtJQUVwQyxZQUNDLElBQU8sRUFDUCxPQUFrQyxFQUNsQyxXQUEwQyxFQUMxQyxPQUFnQixFQUNoQixRQUE2QixFQUM3QixXQUFnQyxFQUNoQyxvQkFBb0M7UUFFcEMsSUFBSSxDQUFDLElBQUksR0FBRyxJQUFJLENBQUM7UUFDakIsYUFBYTtRQUNiLElBQUksQ0FBQyxJQUFJLEdBQUcsRUFBRSxPQUFPLEVBQUUsV0FBVyxFQUFFLENBQUM7UUFDckMsSUFBSSxDQUFDLE9BQU8sR0FBRyxPQUFPLENBQUM7UUFDdkIsSUFBSSxDQUFDLFFBQVEsR0FBRyxRQUFRLENBQUM7UUFDekIsSUFBSSxDQUFDLFdBQVcsR0FBRyxXQUFXLENBQUM7UUFDL0IsSUFBSSxDQUFDLG9CQUFvQixHQUFHLG9CQUFvQixJQUFJLEVBQUUsQ0FBQztJQUN4RCxDQUFDO0lBRUQsMkVBQTJFO0lBQzNFLGtGQUFrRjtJQUNsRixJQUFJLE9BQU8sS0FBZ0MsT0FBTyxJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUM7SUFDdEUsSUFBSSxXQUFXLEtBQW9DLE9BQU8sSUFBSSxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDO0lBSWxGLFFBQVE7UUFDUCxPQUFPLG9CQUFvQixDQUFDO1lBQzNCLElBQUksRUFBRSxJQUFJLENBQUMsSUFBSTtZQUNmLE9BQU8s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OlsiaW1wb3J0IHsgU2VsZWN0aW9uUmFuZ2UgfSBmcm9tIFwiQGNvZGVtaXJyb3Ivc3RhdGVcIjtcbmltcG9ydCB7IE9wdGlvbnMgfSBmcm9tIFwiLi9vcHRpb25zXCI7XG5pbXBvcnQgeyBFbnZpcm9ubWVudCB9IGZyb20gXCIuL2Vudmlyb25tZW50XCI7XG5cbi8qKlxuICogaW4gdmlzdWFsIHNuaXBwZXRzLCBpZiB0aGUgcmVwbGFjZW1lbnQgaXMgYSBzdHJpbmcsIHRoaXMgaXMgdGhlIG1hZ2ljIHN1YnN0cmluZyB0byBpbmRpY2F0ZSB0aGUgc2VsZWN0aW9uLlxuICovXG5leHBvcnQgY29uc3QgVklTVUFMX1NOSVBQRVRfTUFHSUNfU0VMRUNUSU9OX1BMQUNFSE9MREVSID0gXCIke1ZJU1VBTH1cIjtcblxuLyoqXG4gKiB0aGVyZSBhcmUgMyBkaXN0aW5jdCB0eXBlcyBvZiBzbmlwcGV0czpcbiAqXG4gKiBgdmlzdWFsYCBzbmlwcGV0cyBvbmx5IHRyaWdnZXIgb24gdGV4dCBzZWxlY3Rpb25zLlxuICogdmlzdWFsIHNuaXBwZXRzIHN1cHBvcnQgb25seSAoc2luZ2xlLWNoYXJhY3Rlcikgc3RyaW5nIHRyaWdnZXJzLCBhbmQgc3RyaW5nIG9yIGZ1bmN0aW9uIHJlcGxhY2VtZW50cy5cbiAqIHZpc3VhbCByZXBsYWNlbWVudCBmdW5jdGlvbnMgdGFrZSBpbiB0aGUgdGV4dCBzZWxlY3Rpb24gYW5kIHJldHVybiBhIHN0cmluZywgb3IgYGZhbHNlYCB0byBpbmRpY2F0ZSB0byBhY3R1YWxseSBub3QgZG8gYW55dGhpbmcuXG4gKlxuICogYHJlZ2V4YCBzbmlwcGV0cyBzdXBwb3J0IHN0cmluZyAod2l0aCB0aGUgXCJyXCIgcmF3IG9wdGlvbiBzZXQpIG9yIHJlZ2V4IHRyaWdnZXJzLCBhbmQgc3RyaW5nIG9yIGZ1bmN0aW9uIHJlcGxhY2VtZW50cy5cbiAqIHJlZ2V4IHJlcGxhY2VtZW50IGZ1bmN0aW9ucyB0YWtlIGluIHRoZSByZWdleCBtYXRjaCBhbmQgcmV0dXJuIGEgc3RyaW5nLlxuICpcbiAqIGBzdHJpbmdgIHNuaXBwZXRzIHN1cHBvcnQgc3RyaW5nIHRyaWdnZXJzICh3aGVuIG5vIFwiclwiIHJhdyBvcHRpb24gc2V0KSwgYW5kIHN0cmluZyBvciBmdW5jdGlvbiByZXBsYWNlbWVudHMuXG4gKiBzdHJpbmcgcmVwbGFjZW1lbnQgZnVuY3Rpb25zIHRha2UgaW4gdGhlIG1hdGNoZWQgc3RyaW5nIGFuZCByZXR1cm4gYSBzdHJpbmcuXG4gKi9cbmV4cG9ydCB0eXBlIFNuaXBwZXRUeXBlID1cblx0fCBcInZpc3VhbFwiXG5cdHwgXCJyZWdleFwiXG5cdHwgXCJzdHJpbmdcIlxuXG5leHBvcnQgdHlwZSBTbmlwcGV0RGF0YTxUIGV4dGVuZHMgU25pcHBldFR5cGU+ID0ge1xuXHR2aXN1YWw6IHtcblx0XHR0cmlnZ2VyOiBzdHJpbmc7XG5cdFx0cmVwbGFjZW1lbnQ6IHN0cmluZyB8ICgoc2VsZWN0aW9uOiBzdHJpbmcpID0+IHN0cmluZyB8IGZhbHNlKTtcblx0fTtcblx0cmVnZXg6IHtcblx0XHR0cmlnZ2VyOiBSZWdFeHA7XG5cdFx0cmVwbGFjZW1lbnQ6IHN0cmluZyB8ICgobWF0Y2g6IFJlZ0V4cEV4ZWNBcnJheSkgPT4gc3RyaW5nKTtcblx0fTtcblx0c3RyaW5nOiB7XG5cdFx0dHJpZ2dlcjogc3RyaW5nO1xuXHRcdHJlcGxhY2VtZW50OiBzdHJpbmcgfCAoKG1hdGNoOiBzdHJpbmcpID0+IHN0cmluZyk7XG5cdH07XG59W1RdXG5cbmV4cG9ydCB0eXBlIFByb2Nlc3NTbmlwcGV0UmVzdWx0ID1cblx0fCB7IHRyaWdnZXJQb3M6IG51bWJlciwgcmVwbGFjZW1lbnQ6IHN0cmluZyB9XG5cdHwgbnVsbFxuXG4vKipcbiAqIGEgc25pcHBldCBpbnN0YW5jZSBjb250YWlucyBhbGwgdGhlIGluZm9ybWF0aW9uIG5lY2Vzc2FyeSB0byBydW4gYSBzbmlwcGV0LlxuICogc25pcHBldCBkYXRhIHNwZWNpZmljIHRvIGEgY2VydGFpbiB0eXBlIG9mIHNuaXBwZXQgaXMgaW4gaXRzIGBkYXRhYCBwcm9wZXJ0eS5cbiAqL1xuZXhwb3J0IGFic3RyYWN0IGNsYXNzIFNuaXBwZXQ8VCBleHRlbmRzIFNuaXBwZXRUeXBlID0gU25pcHBldFR5cGU+IHtcblx0dHlwZTogVDtcblx0ZGF0YTogU25pcHBldERhdGE8VD47XG5cdG9wdGlvbnM6IE9wdGlvbnM7XG5cdHByaW9yaXR5PzogbnVtYmVyO1xuXHRkZXNjcmlwdGlvbj86IHN0cmluZztcblxuXHRleGNsdWRlZEVudmlyb25tZW50czogRW52aXJvbm1lbnRbXTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHR0eXBlOiBULFxuXHRcdHRyaWdnZXI6IFNuaXBwZXREYXRhPFQ+W1widHJpZ2dlclwiXSxcblx0XHRyZXBsYWNlbWVudDogU25pcHBldERhdGE8VD5bXCJyZXBsYWNlbWVudFwiXSxcblx0XHRvcHRpb25zOiBPcHRpb25zLFxuXHRcdHByaW9yaXR5PzogbnVtYmVyIHwgdW5kZWZpbmVkLFxuXHRcdGRlc2NyaXB0aW9uPzogc3RyaW5nIHwgdW5kZWZpbmVkLFxuXHRcdGV4Y2x1ZGVkRW52aXJvbm1lbnRzPzogRW52aXJvbm1lbnRbXSxcblx0KSB7XG5cdFx0dGhpcy50eXBlID0gdHlwZTtcblx0XHQvLyBAdHMtaWdub3JlXG5cdFx0dGhpcy5kYXRhID0geyB0cmlnZ2VyLCByZXBsYWNlbWVudCB9O1xuXHRcdHRoaXMub3B0aW9ucyA9IG9wdGlvbnM7XG5cdFx0dGhpcy5wcmlvcml0eSA9IHByaW9yaXR5O1xuXHRcdHRoaXMuZGVzY3JpcHRpb24gPSBkZXNjcmlwdGlvbjtcblx0XHR0aGlzLmV4Y2x1ZGVkRW52aXJvbm1lbnRzID0gZXhjbHVkZWRFbnZpcm9ubWVudHMgPz8gW107XG5cdH1cblxuXHQvLyB3ZSBuZWVkIHRvIGV4cGxpY2l0bHkgdHlwZSB0aGUgcmV0dXJuIHZhbHVlIGhlcmUgc28gdGhlIGRlcml2ZWQgY2xhc3Nlcyxcblx0Ly8gaGF2ZSB0aGUgZ2V0dGVyIHR5cGVkIHByb3Blcmx5IGZvciB0aGUgcGFydGljdWxhciA8VD4gdGhlIGRlcml2ZWQgY2xhc3MgZXh0ZW5kc1xuXHRnZXQgdHJpZ2dlcigpOiBTbmlwcGV0RGF0YTxUPltcInRyaWdnZXJcIl0geyByZXR1cm4gdGhpcy5kYXRhLnRyaWdnZXI7IH1cblx0Z2V0IHJlcGxhY2VtZW50KCk6IFNuaXBwZXREYXRhPFQ+W1wicmVwbGFjZW1lbnRcIl0geyByZXR1cm4gdGhpcy5kYXRhLnJlcGxhY2VtZW50OyB9XG5cblx0YWJzdHJhY3QgcHJvY2VzcyhlZmZlY3RpdmVMaW5lOiBzdHJpbmcsIHJhbmdlOiBTZWxlY3Rpb25SYW5nZSwgc2VsOiBzdHJpbmcpOiBQcm9jZXNzU25pcHBldFJlc3VsdDtcblxuXHR0b1N0cmluZygpIHtcblx0XHRyZXR1cm4gc2VyaWFsaXplU25pcHBldExpa2Uoe1xuXHRcdFx0dHlwZTogdGhpcy50eXBlLFxuXHRcdFx0dHJpZ2dlcjogdGhpcy50cmlnZ2VyLFxuXHRcdFx0cmVwbGFjZW1lbnQ6IHRoaXMucmVwbGFjZW1lbnQsXG5cdFx0XHRvcHRpb25zOiB0aGlzLm9wdGlvbnMsXG5cdFx0XHRwcmlvcml0eTogdGhpcy5wcmlvcml0eSxcblx0XHRcdGRlc2NyaXB0aW9uOiB0aGlzLmRlc2NyaXB0aW9uLFxuXHRcdFx0ZXhjbHVkZWRFbnZpcm9ubWVudHM6IHRoaXMuZXhjbHVkZWRFbnZpcm9ubWVudHMsXG5cdFx0fSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFZpc3VhbFNuaXBwZXQgZXh0ZW5kcyBTbmlwcGV0PFwidmlzdWFsXCI+IHtcblx0Y29uc3RydWN0b3IoeyB0cmlnZ2VyLCByZXBsYWNlbWVudCwgb3B0aW9ucywgcHJpb3JpdHksIGRlc2NyaXB0aW9uLCBleGNsdWRlZEVudmlyb25tZW50cyB9OiBDcmVhdGVTbmlwcGV0PFwidmlzdWFsXCI+KSB7XG5cdFx0c3VwZXIoXCJ2aXN1YWxcIiwgdHJpZ2dlciwgcmVwbGFjZW1lbnQsIG9wdGlvbnMsIHByaW9yaXR5LCBkZXNjcmlwdGlvbiwgZXhjbHVkZWRFbnZpcm9ubWVudHMpO1xuXHR9XG5cblx0cHJvY2VzcyhlZmZlY3RpdmVMaW5lOiBzdHJpbmcsIHJhbmdlOiBTZWxlY3Rpb25SYW5nZSwgc2VsOiBzdHJpbmcpOiBQcm9jZXNzU25pcHBldFJlc3VsdCB7XG5cdFx0Y29uc3QgaGFzU2VsZWN0aW9uID0gISFzZWw7XG5cdFx0Ly8gdmlzdWFsIHNuaXBwZXRzIG9ubHkgcnVuIHdoZW4gdGhlcmUgaXMgYSBzZWxlY3Rpb25cblx0XHRpZiAoIWhhc1NlbGVjdGlvbikgeyByZXR1cm4gbnVsbDsgfVxuXG5cdFx0Ly8gY2hlY2sgd2hldGhlciB0aGUgdHJpZ2dlciB0ZXh0IHdhcyB0eXBlZFxuXHRcdGlmICghKGVmZmVjdGl2ZUxpbmUuZW5kc1dpdGgodGhpcy50cmlnZ2VyKSkpIHsgcmV0dXJuIG51bGw7IH1cblxuXHRcdGNvbnN0IHRyaWdnZXJQb3MgPSByYW5nZS5mcm9tO1xuXHRcdGxldCByZXBsYWNlbWVudDtcblx0XHRpZiAodHlwZW9mIHRoaXMucmVwbGFjZW1lbnQgPT09IFwic3RyaW5nXCIpIHtcblx0XHRcdHJlcGxhY2VtZW50ID0gdGhpcy5yZXBsYWNlbWVudC5yZXBsYWNlKFZJU1VBTF9TTklQUEVUX01BR0lDX1NFTEVDVElPTl9QTEFDRUhPTERFUiwgc2VsKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmVwbGFjZW1lbnQgPSB0aGlzLnJlcGxhY2VtZW50KHNlbCk7XG5cblx0XHRcdC8vIHNhbml0eSBjaGVjayAtIGlmIHRoaXMucmVwbGFjZW1lbnQgd2FzIGEgZnVuY3Rpb24sXG5cdFx0XHQvLyB3ZSBoYXZlIG5vIHdheSB0byB2YWxpZGF0ZSBiZWZvcmVoYW5kIHRoYXQgaXQgcmVhbGx5IGRvZXMgcmV0dXJuIGEgc3RyaW5nXG5cdFx0XHRpZiAodHlwZW9mIHJlcGxhY2VtZW50ICE9PSBcInN0cmluZ1wiKSB7IHJldHVybiBudWxsOyB9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHsgdHJpZ2dlclBvcywgcmVwbGFjZW1lbnQgfTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgUmVnZXhTbmlwcGV0IGV4dGVuZHMgU25pcHBldDxcInJlZ2V4XCI+IHtcblxuXHRjb25zdHJ1Y3Rvcih7IHRyaWdnZXIsIHJlcGxhY2VtZW50LCBvcHRpb25zLCBwcmlvcml0eSwgZGVzY3JpcHRpb24sIGV4Y2x1ZGVkRW52aXJvbm1lbnRzIH06IENyZWF0ZVNuaXBwZXQ8XCJyZWdleFwiPikge1xuXHRcdHN1cGVyKFwicmVnZXhcIiwgdHJpZ2dlciwgcmVwbGFjZW1lbnQsIG9wdGlvbnMsIHByaW9yaXR5LCBkZXNjcmlwdGlvbiwgZXhjbHVkZWRFbnZpcm9ubWVudHMpO1xuXHR9XG5cblx0cHJvY2VzcyhlZmZlY3RpdmVMaW5lOiBzdHJpbmcsIHJhbmdlOiBTZWxlY3Rpb25SYW5nZSwgc2VsOiBzdHJpbmcpOiBQcm9jZXNzU25pcHBldFJlc3VsdCB7XG5cdFx0Y29uc3QgaGFzU2VsZWN0aW9uID0gISFzZWw7XG5cdFx0Ly8gbm9uLXZpc3VhbCBzbmlwcGV0cyBvbmx5IHJ1biB3aGVuIHRoZXJlIGlzIG5vIHNlbGVjdGlvblxuXHRcdGlmIChoYXNTZWxlY3Rpb24pIHsgcmV0dXJuIG51bGw7IH1cblxuXHRcdGNvbnN0IHJlc3VsdCA9IHRoaXMudHJpZ2dlci5leGVjKGVmZmVjdGl2ZUxpbmUpO1xuXHRcdGlmIChyZXN1bHQgPT09IG51bGwpIHsgcmV0dXJuIG51bGw7IH1cblxuXHRcdGNvbnN0IHRyaWdnZXJQb3MgPSByZXN1bHQuaW5kZXg7XG5cblx0XHRsZXQgcmVwbGFjZW1lbnQ7XG5cdFx0aWYgKHR5cGVvZiB0aGlzLnJlcGxhY2VtZW50ID09PSBcInN0cmluZ1wiKSB7XG5cdFx0XHQvLyBDb21wdXRlIHRoZSByZXBsYWNlbWVudCBzdHJpbmdcblx0XHRcdC8vIHJlc3VsdC5sZW5ndGggLSAxID0gdGhlIG51bWJlciBvZiBjYXB0dXJpbmcgZ3JvdXBzXG5cblx0XHRcdGNvbnN0IG5DYXB0dXJlR3JvdXBzID0gcmVzdWx0Lmxlbmd0aCAtIDE7XG5cdFx0XHRyZXBsYWNlbWVudCA9IEFycmF5LmZyb20oeyBsZW5ndGg6IG5DYXB0dXJlR3JvdXBzIH0pXG5cdFx0XHRcdC5tYXAoKF8sIGkpID0+IGkgKyAxKVxuXHRcdFx0XHQucmVkdWNlKFxuXHRcdFx0XHRcdChyZXBsYWNlbWVudCwgaSkgPT4gcmVwbGFjZW1lbnQucmVwbGFjZUFsbChgW1ske2kgLSAxfV1dYCwgcmVzdWx0W2ldKSxcblx0XHRcdFx0XHR0aGlzLnJlcGxhY2VtZW50XG5cdFx0XHRcdCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJlcGxhY2VtZW50ID0gdGhpcy5yZXBsYWNlbWVudChyZXN1bHQpO1xuXG5cdFx0XHQvLyBzYW5pdHkgY2hlY2sgLSBpZiB0aGlzLnJlcGxhY2VtZW50IHdhcyBhIGZ1bmN0aW9uLFxuXHRcdFx0Ly8gd2UgaGF2ZSBubyB3YXkgdG8gdmFsaWRhdGUgYmVmb3JlaGFuZCB0aGF0IGl0IHJlYWxseSBkb2VzIHJldHVybiBhIHN0cmluZ1xuXHRcdFx0aWYgKHR5cGVvZiByZXBsYWNlbWVudCAhPT0gXCJzdHJpbmdcIikgeyByZXR1cm4gbnVsbDsgfVxuXHRcdH1cblxuXHRcdHJldHVybiB7IHRyaWdnZXJQb3MsIHJlcGxhY2VtZW50IH07XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFN0cmluZ1NuaXBwZXQgZXh0ZW5kcyBTbmlwcGV0PFwic3RyaW5nXCI+IHtcblx0ZGF0YTogU25pcHBldERhdGE8XCJzdHJpbmdcIj47XG5cblx0Y29uc3RydWN0b3IoeyB0cmlnZ2VyLCByZXBsYWNlbWVudCwgb3B0aW9ucywgcHJpb3JpdHksIGRlc2NyaXB0aW9uLCBleGNsdWRlZEVudmlyb25tZW50czogZXhjbHVkZUluIH06IENyZWF0ZVNuaXBwZXQ8XCJzdHJpbmdcIj4pIHtcblx0XHRzdXBlcihcInN0cmluZ1wiLCB0cmlnZ2VyLCByZXBsYWNlbWVudCwgb3B0aW9ucywgcHJpb3JpdHksIGRlc2NyaXB0aW9uLCBleGNsdWRlSW4pO1xuXHR9XG5cblx0cHJvY2VzcyhlZmZlY3RpdmVMaW5lOiBzdHJpbmcsIHJhbmdlOiBTZWxlY3Rpb25SYW5nZSwgc2VsOiBzdHJpbmcpOiBQcm9jZXNzU25pcHBldFJlc3VsdCB7XG5cdFx0Y29uc3QgaGFzU2VsZWN0aW9uID0gISFzZWw7XG5cdFx0Ly8gbm9uLXZpc3VhbCBzbmlwcGV0cyBvbmx5IHJ1biB3aGVuIHRoZXJlIGlzIG5vIHNlbGVjdGlvblxuXHRcdGlmIChoYXNTZWxlY3Rpb24pIHsgcmV0dXJuIG51bGw7IH1cblxuXHRcdC8vIENoZWNrIHdoZXRoZXIgdGhlIHRyaWdnZXIgdGV4dCB3YXMgdHlwZWRcblx0XHRpZiAoIShlZmZlY3RpdmVMaW5lLmVuZHNXaXRoKHRoaXMudHJpZ2dlcikpKSB7IHJldHVybiBudWxsOyB9XG5cblx0XHRjb25zdCB0cmlnZ2VyUG9zID0gZWZmZWN0aXZlTGluZS5sZW5ndGggLSB0aGlzLnRyaWdnZXIubGVuZ3RoO1xuXHRcdGNvbnN0IHJlcGxhY2VtZW50ID0gdHlwZW9mIHRoaXMucmVwbGFjZW1lbnQgPT09IFwic3RyaW5nXCJcblx0XHRcdD8gdGhpcy5yZXBsYWNlbWVudFxuXHRcdFx0OiB0aGlzLnJlcGxhY2VtZW50KHRoaXMudHJpZ2dlcik7XG5cblx0XHQvLyBzYW5pdHkgY2hlY2sgLSBpZiByZXBsYWNlbWVudCB3YXMgYSBmdW5jdGlvbixcblx0XHQvLyB3ZSBoYXZlIG5vIHdheSB0byB2YWxpZGF0ZSBiZWZvcmVoYW5kIHRoYXQgaXQgcmVhbGx5IGRvZXMgcmV0dXJuIGEgc3RyaW5nXG5cdFx0aWYgKHR5cGVvZiByZXBsYWNlbWVudCAhPT0gXCJzdHJpbmdcIikgeyByZXR1cm4gbnVsbDsgfVxuXG5cdFx0cmV0dXJuIHsgdHJpZ2dlclBvcywgcmVwbGFjZW1lbnQgfTtcblx0fVxufVxuXG4vKipcbiAqIHJlcGxhY2VyIGZ1bmN0aW9uIGZvciBzZXJpYWxpemluZyBzbmlwcGV0c1xuICogQHBhcmFtIGtcbiAqIEBwYXJhbSB2XG4gKiBAcmV0dXJuc1xuICovXG5mdW5jdGlvbiByZXBsYWNlcihrOiBzdHJpbmcsIHY6IHVua25vd24pIHtcblx0aWYgKHR5cGVvZiB2ID09PSBcImZ1bmN0aW9uXCIpIHsgcmV0dXJuIFwiW1tGdW5jdGlvbl1dXCI7IH1cblx0aWYgKHYgaW5zdGFuY2VvZiBSZWdFeHApIHsgcmV0dXJuIGBbW1JlZ0V4cF1dOiAke3YudG9TdHJpbmcoKX1gOyB9XG5cdHJldHVybiB2O1xufVxuXG50eXBlIENyZWF0ZVNuaXBwZXQ8VCBleHRlbmRzIFNuaXBwZXRUeXBlPiA9IHtcblx0b3B0aW9uczogT3B0aW9ucztcblx0cHJpb3JpdHk/OiBudW1iZXI7XG5cdGRlc2NyaXB0aW9uPzogc3RyaW5nO1xuXHRleGNsdWRlZEVudmlyb25tZW50cz86IEVudmlyb25tZW50W107XG59ICYgU25pcHBldERhdGE8VD5cblxuXG4vKipcbiAqIHNlcmlhbGl6ZSBhIHNuaXBwZXQtbGlrZSBvYmplY3QuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzZXJpYWxpemVTbmlwcGV0TGlrZShzbmlwcGV0TGlrZTogdW5rbm93bikge1xuXHRyZXR1cm4gSlNPTi5zdHJpbmdpZnkoc25pcHBldExpa2UsIHJlcGxhY2VyLCAyKTtcbn0iXX0=