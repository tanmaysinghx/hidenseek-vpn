import { Globe } from "lucide-react";
import { cx } from "./ui";

/** SVG flags (flag-icons), since Windows doesn't render flag emoji. */
export function Flag({ code, className }: { code: string | null | undefined; className?: string }) {
  if (!code) {
    return (
      <span className={cx("grid place-items-center rounded-md bg-white/5 text-ink-400", className ?? "size-8")}>
        <Globe className="size-1/2" />
      </span>
    );
  }
  return (
    <span
      className={cx("fi fis inline-block shrink-0 overflow-hidden rounded-md ring-1 ring-white/10", `fi-${code.toLowerCase()}`, className ?? "size-8")}
      style={{ backgroundSize: "cover" }}
      aria-label={code}
    />
  );
}
