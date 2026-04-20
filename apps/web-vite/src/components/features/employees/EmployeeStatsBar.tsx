type EmployeeStatsBarProps = {
  total: number;
  active: number;
  onLeave: number;
  terminated: number;
};

export function EmployeeStatsBar({ total, active, onLeave, terminated }: EmployeeStatsBarProps) {
  const Item = ({ label, value }: { label: string; value: number }) => (
    <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-neutral-500">{label}</p>
      <p className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">{value}</p>
    </div>
  );

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <Item label="Total" value={total} />
      <Item label="Active" value={active} />
      <Item label="On Leave" value={onLeave} />
      <Item label="Terminated" value={terminated} />
    </div>
  );
}
