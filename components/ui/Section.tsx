import type { ReactNode } from "react";

export function Section({ title, right, children, className = "" }: {
  title: string; right?: ReactNode; children: ReactNode; className?: string;
}) {
  return (
    <section className={`border-b border-line px-4 py-3 ${className}`}>
      <header className="mb-2 flex h-5 items-center justify-between gap-2">
        <h2 className="lbl">{title}</h2>
        {right}
      </header>
      {children}
    </section>
  );
}
