import { CATEGORIES, PARENTS } from "@/data/categories";
import { useSettings } from "@/data/settings";
import { cx } from "./ui";

/**
 * Change a merchant's category from any table. Saves a rule for the merchant, so every past and
 * future transaction from it follows (the newest choice for a merchant replaces older ones).
 */
export function useSetMerchantCategory() {
  const rules = useSettings((s) => s.rules);
  const setRules = useSettings((s) => s.setRules);
  return (merchant: string, category: string) =>
    setRules([{ match: merchant, category }, ...rules.filter((r) => r.match.toUpperCase() !== merchant.toUpperCase())]);
}

export function CategorySelect({ merchant, value, className, placeholder }: {
  /** Merchant key (see merchantKey) the rule will match. */
  merchant: string;
  value?: string;
  className?: string;
  /** Show an empty "Choose…" option instead of the current value. */
  placeholder?: string;
}) {
  const set = useSetMerchantCategory();
  return (
    <select
      aria-label={`Category for ${merchant}`}
      title="Changes the category for every transaction from this merchant"
      value={placeholder ? "" : (value ?? "uncategorised")}
      onChange={(e) => e.target.value && set(merchant, e.target.value)}
      className={cx(
        "h-7 max-w-56 rounded border border-transparent bg-transparent px-1 text-[12px] text-fg-2 hover:border-line focus:border-line",
        className,
      )}
    >
      {placeholder && <option value="">{placeholder}</option>}
      {PARENTS.map((p) => (
        <optgroup key={p.id} label={p.label}>
          {CATEGORIES.filter((c) => c.parent === p.id).map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
