export function StatCard({
  label,
  value,
  iconColor,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  iconColor: string;
  icon: React.ElementType;
}) {
  return (
    <div className="bg-dark-400/30 rounded-lg p-2.5 flex items-center gap-2">
      <div className="w-8 h-8 rounded-md bg-dark-600 flex items-center justify-center">
        <Icon size={14} className={iconColor} />
      </div>
      <div>
        <div className="text-lg font-bold text-white leading-tight">
          {typeof value === "number" ? value.toLocaleString() : value}
        </div>
        <div className="text-[10px] text-gray-600 uppercase tracking-wider">
          {label}
        </div>
      </div>
    </div>
  );
}
