import { EditorView, Decoration } from "@codemirror/view";
import { EditorSelection, StateEffect, StateField } from "@codemirror/state";
import { TabstopGroup } from "../tabstop";

const addTabstopsEffect = StateEffect.define<TabstopGroup[]>();
const removeAllTabstopsEffect = StateEffect.define();

export const tabstopsStateField = StateField.define<TabstopGroup[]>({

	create() {
		return [];
	},

	update(value, transaction) {
		let tabstopGroups = value;
		tabstopGroups.forEach(grp => grp.map(transaction.changes));

		for (const effect of transaction.effects) {
			if (effect.is(addTabstopsEffect)) {
				tabstopGroups.unshift(...effect.value);
			}
			else if (effect.is(removeAllTabstopsEffect)) {
				tabstopGroups = [];
			}
		}

		// Remove the tabstop groups that the cursor has passed. This scenario
		// happens when the user manually moves the cursor using arrow keys or mouse
		if (transaction.selection) {
			const currTabstopGroupIndex = getCurrentTabstopGroupIndex(
				tabstopGroups,
				transaction.selection
			);
			tabstopGroups = tabstopGroups.slice(currTabstopGroupIndex);
			
			if (tabstopGroups.length <= 1) {
				// Clear all tabstop groups if there's just one remaining
				tabstopGroups = [];
			} else {
				tabstopGroups[0].hideFromEditor();
			}
		}

		return tabstopGroups;
	},

	provide: (field) => {
		return EditorView.decorations.of(view => {
			// "Flatten" the array of DecorationSets to produce a single DecorationSet
			const tabstopGroups = view.state.field(field);
			const decos = [];

			for (const tabstopGroup of tabstopGroups) {
				if (!tabstopGroup.hidden)
					decos.push(...tabstopGroup.getRanges());
			}

			return Decoration.set(decos, true);
		});
	}
});

/**
 * Retrieves the index of the current tabstop group that contains the given selection.
 *
 * @param tabstopGroups - An array of `TabstopGroup` objects to search through.
 * @param sel - The current `EditorSelection` to check against the tabstop groups.
 * @returns The index of the tabstop group that contains the selection, or the length of the `tabstopGroups` array if no group contains the selection.
 */
function getCurrentTabstopGroupIndex(
	tabstopGroups: TabstopGroup[],
	sel: EditorSelection
): number {
	for (let i = 0; i < tabstopGroups.length; i++) {
		const tabstopGroup = tabstopGroups[i];
		if (tabstopGroup.containsSelection(sel)) return i;
	}
	return tabstopGroups.length;
}

/**
 * Retrieves the current tabstop groups from the editor view.
 * 
 * This function accesses the `tabstopsStateField` in the editor view's state
 * and returns the array of `TabstopGroup` objects that are currently present.
 * 
 * @param view - The editor view from which the tabstop groups will be retrieved.
 * @returns An array of `TabstopGroup` objects currently in the editor view.
 */
export function getTabstopGroupsFromView(view: EditorView) {
	const currentTabstopGroups = view.state.field(tabstopsStateField);

	return currentTabstopGroups;
}

export function addTabstops(view: EditorView, tabstopGroups: TabstopGroup[]) {
	view.dispatch({
		effects: [addTabstopsEffect.of(tabstopGroups)],
	});
}

/**
 * Removes all tabstop groups from the editor view.
 * 
 * @param view - The editor view from which all tabstop groups will be removed.
 */
export function removeAllTabstops(view: EditorView) {
	view.dispatch({
		effects: [removeAllTabstopsEffect.of(null)],
	});
}

// const COLORS = ["lightskyblue", "orange", "lime"];
const N_COLORS = 3;

/**
 * Determines the next available color index for a new tabstop group.
 * 
 * This function checks the existing tabstop groups in the editor view and 
 * returns the first color index that is not currently in use. If all color 
 * indices are in use, it returns 0 as a fallback.
 * 
 * @param view - The editor view from which the tabstop groups will be checked.
 * @returns The index of the next available color for a new tabstop group.
 */
export function getNextTabstopColor(view: EditorView) {
	const field = view.state.field(tabstopsStateField);
	const existingColors = field.map(tabstopGroup => tabstopGroup.color);
	const uniqueExistingColors = new Set(existingColors);

	// Iterate through the possible color indices and return the first one that is not in use
	for (let i = 0; i < N_COLORS; i++) {
		if (!uniqueExistingColors.has(i)) return i;
	}

	// If all color indices are in use, return 0 as a fallback
	return 0;
}
