import { eq, gt, map, size } from "lodash-es";
import React from "react";

export interface NavItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  badge?: string | number;
  href?: string;
  isNew?: boolean;
}

export interface CWNavBarProps {
  /** Logo element */
  logo?: React.ReactNode;
  /** Navigation items */
  items: NavItem[];
  /** Currently active item */
  activeItem?: string;
  /** Right side elements */
  rightContent?: React.ReactNode;
  /** Item click handler */
  onItemClick?: (item: NavItem) => void;
  className?: string;
}

export const CWNavBar = ({
  logo,
  items,
  activeItem,
  rightContent,
  onItemClick,
  className = "",
}: CWNavBarProps) => {
  return (
    <nav
      className={`flex items-center justify-between bg-[#050505] border-b border-[#1e1e1e] px-3 h-10 ${className}`}
    >
      {/* Left: Logo & Nav Items */}
      <div className="flex items-center gap-4">
        {logo && (
          <div className="flex items-center gap-2 text-[#ffc107] font-semibold text-sm">
            {logo}
          </div>
        )}

        <div className="flex items-center gap-0.5">
          {map(items, (item) => (
            <button
              key={item.id}
              onClick={() => onItemClick?.(item)}
              className={`
                flex items-center gap-1.5 px-2.5 py-1 rounded-sm text-xs font-medium uppercase tracking-wide
                transition-colors duration-150
                ${
                  eq(activeItem, item.id)
                    ? "bg-[#111111] text-[#ececec]"
                    : "text-[#888888] hover:text-[#ececec] hover:bg-[#0a0a0a]"
                }
              `}
            >
              {item.icon}
              <span>{item.label}</span>
              {item.isNew && (
                <span className="px-1 py-0.5 text-[8px] font-bold bg-[#ffc107] text-[#0d0d0e] rounded uppercase">
                  New
                </span>
              )}
              {item.badge && (
                <span className="px-1.5 py-0.5 text-[10px] bg-[#2a2a2d] text-[#8a8a8a] rounded-full">
                  {item.badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Right side content */}
      {rightContent && (
        <div className="flex items-center gap-4">{rightContent}</div>
      )}
    </nav>
  );
};

/** Sidebar navigation */
export interface CWSidebarProps {
  items: NavItem[];
  activeItem?: string;
  collapsed?: boolean;
  onItemClick?: (item: NavItem) => void;
  footer?: React.ReactNode;
  className?: string;
}

export const CWSidebar = ({
  items,
  activeItem,
  collapsed = false,
  onItemClick,
  footer,
  className = "",
}: CWSidebarProps) => {
  return (
    <aside
      className={`
      flex flex-col bg-[#050505] border-r border-[#151515]
      ${collapsed ? "w-12" : "w-48"}
      transition-all duration-200
      ${className}
    `}
    >
      <div className="flex-1 py-2 space-y-0.5">
        {map(items, (item) => (
          <button
            key={item.id}
            onClick={() => onItemClick?.(item)}
            className={`
              flex items-center gap-3 w-full px-3 py-2 text-xs uppercase tracking-wide font-medium
              transition-all duration-150 relative
              ${
                eq(activeItem, item.id)
                  ? "bg-[#111111] text-[#ececec]"
                  : "text-[#666666] hover:text-[#ececec] hover:bg-[#0a0a0a]"
              }
            `}
            title={collapsed ? item.label : undefined}
          >
            {eq(activeItem, item.id) && (
              <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-[#ececec]" />
            )}

            {item.icon && (
              <span
                className={`flex-shrink-0 ${eq(activeItem, item.id) ? "text-[#ececec]" : "text-[#444444]"}`}
              >
                {item.icon}
              </span>
            )}
            {!collapsed && (
              <>
                <span className="flex-1 text-left">{item.label}</span>
                {item.badge && (
                  <span className="px-1.5 py-0.5 text-[9px] font-mono bg-[#1a1a1a] text-[#888888] rounded">
                    {item.badge}
                  </span>
                )}
              </>
            )}
          </button>
        ))}
      </div>

      {footer && <div className="border-t border-[#151515] p-2">{footer}</div>}
    </aside>
  );
};

/** Breadcrumb navigation */
export interface BreadcrumbItem {
  label: string;
  href?: string;
  onClick?: () => void;
}

export interface CWBreadcrumbProps {
  items: BreadcrumbItem[];
  separator?: React.ReactNode;
  className?: string;
}

export const CWBreadcrumb = ({
  items,
  separator = "/",
  className = "",
}: CWBreadcrumbProps) => {
  return (
    <nav className={`flex items-center gap-2 text-sm ${className}`}>
      {map(items, (item, index) => (
        <React.Fragment key={index}>
          {gt(index, 0) && <span className="text-[#5a5a5a]">{separator}</span>}
          {eq(index, size(items) - 1) ? (
            <span className="text-[#e8e8e8]">{item.label}</span>
          ) : (
            <button
              onClick={item.onClick}
              className="text-[#8a8a8a] hover:text-[#e8e8e8] transition-colors"
            >
              {item.label}
            </button>
          )}
        </React.Fragment>
      ))}
    </nav>
  );
};
