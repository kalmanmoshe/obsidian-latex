import {
  Extension,
  StateEffect,
  StateField,
  Transaction,
} from "@codemirror/state";
import { EditorView } from "@codemirror/view";

type TrackedChange = {
  text: string;
  from: number;
  to: number;
  timestamp: number;
};
export type TransactionLogger = {
  extension: Extension;
  getHistory: () => TrackedChange[];
  getLatestChange: () => TrackedChange | null;
  hasRecentChanges: (expireMs?: number) => boolean;
  clear: () => void;
};
export function createTransactionLogger(
  maxEntries: number = 10,
): TransactionLogger {
  let transactionHistory: TrackedChange[] = [];

  const transactionLog = StateField.define<TrackedChange[]>({
    create() {
      return [];
    },
    update(value, tr) {
      if (!tr.docChanged) return value;
      tr.changes.iterChanges((fromA, toA, fromB, toB, inserted) => {
        const change: TrackedChange = {
          text: inserted.toString(), // this is the new inserted content
          from: fromA,
          to: toA,
          timestamp: Date.now(),
        };
        transactionHistory.push(change);
        if (transactionHistory.length > maxEntries) {
          transactionHistory.shift(); // remove oldest
        }
      });
      return value; // We don’t store in state, just piggyback to tap into the transaction
    },
  });

  return {
    extension: transactionLog,
    getHistory: () => transactionHistory.slice(), // Return a copy
    getLatestChange: () =>
      history.length > 0
        ? transactionHistory[transactionHistory.length - 1]
        : null,
    hasRecentChanges: (expireMs = 1000) => {
      const now = Date.now();
      return transactionHistory.some(
        (change) => now - change.timestamp < expireMs,
      );
    },
    clear: () => (transactionHistory.length = 0),
  };
}
