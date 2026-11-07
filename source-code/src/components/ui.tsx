import type { ButtonHTMLAttributes, ReactNode } from "react";

/** Small shared primitives. Will be replaced/extended by shadcn components as the app grows. */

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

type Variant = "primary" | "secondary" | "ghost";

export function Button({
  variant = "secondary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      {...props}
      className={cx(
        "inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-3 text-[13px] font-medium transition-colors duration-100",
        "disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" && "bg-accent text-accent-fg hover:bg-accent-hover",
        variant === "secondary" && "border border-line bg-panel text-fg hover:border-line-strong hover:bg-hover",
        variant === "ghost" && "text-fg-2 hover:bg-hover hover:text-fg",
        className,
      )}
    />
  );
}

export function Card({ title, actions, children, className }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("rounded-[10px] border border-line-subtle bg-panel shadow-card", className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 border-b border-line-subtle px-4 py-3">
          <h2 className="text-[15px] font-semibold">{title}</h2>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

type Tone = "neutral" | "info" | "warn" | "neg" | "pos" | "accent";

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-medium leading-[14px]",
        tone === "neutral" && "bg-selected text-fg-2",
        tone === "info" && "bg-info-subtle text-info",
        tone === "warn" && "bg-warn-subtle text-warn",
        tone === "neg" && "bg-neg-subtle text-neg",
        tone === "pos" && "bg-pos-subtle text-pos",
        tone === "accent" && "bg-accent-subtle text-accent",
      )}
    >
      {children}
    </span>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warn" | "neg"; children: ReactNode }) {
  return (
    <div
      role={tone === "neg" ? "alert" : "status"}
      className={cx(
        "rounded-md border px-3 py-2 text-[13px]",
        tone === "info" && "border-info/25 bg-info-subtle text-fg",
        tone === "warn" && "border-warn/30 bg-warn-subtle text-fg",
        tone === "neg" && "border-neg/30 bg-neg-subtle text-fg",
      )}
    >
      {children}
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: ReactNode; title?: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-md border border-line bg-bg-deep p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cx(
            "inline-flex h-7 items-center gap-1 rounded-[5px] px-2 text-[12px] font-medium transition-colors duration-100",
            value === o.value ? "bg-raised text-fg shadow-card" : "text-fg-3 hover:text-fg",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Centred dialog over the page; closes on Esc, the close button or a click outside. */
export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; wide?: boolean }) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-[6vh] backdrop-blur-[2px]"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      onKeyDown={(e) => e.key === "Escape" && onClose()}
    >
      <div role="dialog" aria-modal="true" aria-label={typeof title === "string" ? title : undefined} className={cx("w-full rounded-[12px] border border-line bg-panel shadow-pop", wide ? "max-w-5xl" : "max-w-2xl")}>
        <header className="flex items-center justify-between gap-3 border-b border-line-subtle px-5 py-3">
          <h2 className="text-[16px] font-semibold">{title}</h2>
          <button autoFocus onClick={onClose} className="grid size-8 place-items-center rounded-md text-fg-3 hover:bg-hover hover:text-fg" aria-label="Close">
            ✕
          </button>
        </header>
        <div className="max-h-[78vh] overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}
