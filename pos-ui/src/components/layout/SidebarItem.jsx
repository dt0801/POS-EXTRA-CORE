import React from "react";

export default function SidebarItem({
  icon,
  label,
  view,
  isActive,
  isSidebarExpanded,
  onClick,
}) {
  return (
    <button
      onClick={onClick}
      title={!isSidebarExpanded ? label : undefined}
      className={`flex items-center transition-all duration-300 font-manrope font-semibold uppercase tracking-wider overflow-hidden
        ${isSidebarExpanded ? "w-full gap-3 px-4 py-3 rounded-xl" : "w-12 h-12 justify-center rounded-[1.2rem] mx-auto"}
        ${isActive
          ? "bg-primary text-white shadow-md shadow-primary/30"
          : "text-on-surface-variant hover:bg-surface-variant hover:text-on-surface"}`}
    >
      <span className="material-symbols-outlined text-[24px] shrink-0">{icon}</span>
      {isSidebarExpanded && <span className="text-xs whitespace-nowrap">{label}</span>}
    </button>
  );
}
