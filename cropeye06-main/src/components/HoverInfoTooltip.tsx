import React, { useState, useId } from "react";
import { Info } from "lucide-react";

interface HoverInfoTooltipProps {
  text: string;
  className?: string;
  iconClassName?: string;
}

/** Small info icon with hover / tap tooltip (matches dashboard metric cards). */
export const HoverInfoTooltip: React.FC<HoverInfoTooltipProps> = ({
  text,
  className = "",
  iconClassName = "w-3.5 h-3.5 text-gray-400 hover:text-blue-600 cursor-help shrink-0",
}) => {
  const [open, setOpen] = useState(false);
  const id = useId();

  return (
    <span
      className={`relative inline-flex items-center ${className}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onClick={(e) => {
        e.stopPropagation();
        setOpen((v) => !v);
      }}
    >
      <Info
        className={iconClassName}
        aria-describedby={open ? id : undefined}
        tabIndex={0}
      />
      {open ? (
        <span
          id={id}
          role="tooltip"
          className="absolute z-[200] bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2.5 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-200 shadow-lg rounded-md w-52 max-w-[min(13rem,75vw)] text-center leading-snug pointer-events-none"
        >
          {text}
        </span>
      ) : null}
    </span>
  );
};
