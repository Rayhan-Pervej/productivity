// The frame every full-page view shares: title, subtitle, and a centered readable column.
import type { ReactNode } from "react";

export function Page({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl px-8 py-10">
        <h1 className="text-[24px] font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 text-[13.5px] text-muted">{subtitle}</p>
        <div className="mt-8">{children}</div>
      </div>
    </div>
  );
}
