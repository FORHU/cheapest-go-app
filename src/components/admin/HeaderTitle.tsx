import { FileDown } from "lucide-react";

interface HeaderTitleProps {
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

const styles = {
  wrapper: "flex flex-col sm:flex-row sm:items-end justify-between gap-6 mb-8",
  title: "text-4xl font-black tracking-tight text-slate-900 dark:text-white",
  subtitle: "text-slate-400 font-bold text-sm uppercase tracking-widest flex items-center gap-2",
  pulse: "w-2 h-2 bg-blue-500 rounded-full animate-pulse",
};

export function HeaderTitle({ title, subtitle, actions }: HeaderTitleProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 mb-8 min-h-[4rem]">
      <div className="flex-1" />
      <div className="flex items-center gap-3">
        {actions}
      </div>
    </div>
  );
}