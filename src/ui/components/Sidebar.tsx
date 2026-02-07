import classNames from "classnames";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

export interface SidebarItem {
  id: string;
  label: string;
  icon: ReactNode;
  onClick?: () => void;
  badge?: number | string;
}

interface SidebarProps {
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  items: SidebarItem[];
  activeId: string;
  onItemClick: (item: SidebarItem) => void;
  footer?: ReactNode;
  header?: ReactNode;
  className?: string;
}

export const Sidebar = ({
  collapsed,
  setCollapsed,
  items,
  activeId,
  onItemClick,
  footer,
  header,
  className,
}: SidebarProps) => {
  return (
    <motion.div
      layout
      style={{ width: collapsed ? 64 : 200 }}
      className={classNames(
        "h-screen flex-shrink-0 flex flex-col z-20 bg-dark-900/50",
        className,
      )}
    >
      {/* Header / Toggle */}
      <div className="h-14 flex items-center justify-between px-4">
        {!collapsed && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="font-bold text-white tracking-wider truncate"
          >
            {header || "POLYGON"}
          </motion.div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-dark-700 transition-colors ml-auto"
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      {/* Nav Items */}
      <div className="flex-1 overflow-y-auto py-4 flex flex-col gap-0.5 px-2 scrollbar-none">
        {items.map((item) => {
          const isActive = activeId === item.id;
          return (
            <button
              key={item.id}
              onClick={() => {
                if (item.onClick) item.onClick();
                onItemClick(item);
              }}
              className={classNames(
                "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-all duration-150",
                isActive
                  ? "bg-dark-600 text-gray-200"
                  : "text-gray-400 hover:bg-dark-600 hover:text-gray-200",
              )}
              aria-pressed={isActive}
              role="tab"
              title={collapsed ? item.label : undefined}
            >
              <span className="flex-shrink-0">{item.icon}</span>
              {!collapsed && <span className="truncate">{item.label}</span>}
              {!collapsed && item.badge && (
                <span className="text-[10px] bg-lime-600 text-white px-1.5 py-0.5 rounded-md min-w-[18px] text-center ml-auto">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Footer */}
      <div className="p-4">
        {!collapsed ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            {footer}
          </motion.div>
        ) : (
          <div className="flex justify-center text-xs text-gray-500">●</div>
        )}
      </div>
    </motion.div>
  );
};
