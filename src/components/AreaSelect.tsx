// Pick an area (Office, Client, Study…), with its color shown inside the box.
import { useApp } from "@/store/app";
import { Select } from "./Select";

export function AreaSelect({
  value,
  onChange,
  size = "md",
  className,
}: {
  value: string;
  onChange: (areaId: string) => void;
  size?: "sm" | "md";
  className?: string;
}) {
  const areas = useApp((s) => s.areas);
  const color = areas.find((a) => a.id === value)?.color ?? "var(--text-muted)";
  return (
    <Select
      label="Area"
      value={value}
      onChange={onChange}
      size={size}
      className={className}
      leading={<span className="size-2 rounded-full" style={{ background: color }} />}
      options={areas.map((a) => ({ value: a.id, label: a.name }))}
    />
  );
}
