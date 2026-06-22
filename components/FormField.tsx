import React from 'react';

interface FormFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: React.ReactNode;
  error?: string | null;
  helper?: React.ReactNode;
  leftSlot?: React.ReactNode;
  rightSlot?: React.ReactNode;
  containerClassName?: string;
  inputClassName?: string;
  size?: 'md' | 'sm';
  borderless?: boolean;
}

const sizeClasses: Record<NonNullable<FormFieldProps['size']>, string> = {
  md: 'h-12 px-4 text-[15px]',
  sm: 'h-11 px-3.5 text-[14px]',
};

const baseInputClass =
  'w-full rounded-2xl text-textPrimary placeholder:text-textMuted outline-none transition-all duration-200';

const FormField = React.forwardRef<HTMLInputElement, FormFieldProps>(
  (
    {
      label,
      error,
      helper,
      leftSlot,
      rightSlot,
      containerClassName = '',
      inputClassName = '',
      size = 'md',
      borderless = false,
      className,
      ...inputProps
    },
    ref,
  ) => {
    const hasLeftSlot = !!leftSlot;
    const hasRightSlot = !!rightSlot;

    return (
      <div className={containerClassName}>
        {label ? (
          <label
            htmlFor={inputProps.id}
            className="mb-1.5 block text-[13px] font-medium text-textSecondary"
          >
            {label}
          </label>
        ) : null}
        <div className="relative">
          {hasLeftSlot ? (
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-textMuted">
              {leftSlot}
            </div>
          ) : null}
          <input
            ref={ref}
            className={[
              baseInputClass,
              sizeClasses[size],
              borderless
                ? 'border-0 bg-transparent focus:ring-0 focus:border-transparent'
                : 'border border-white/5 bg-surfaceElevated focus:border-white/10 focus:bg-surfaceElevated/90 focus:ring-0',
              hasLeftSlot ? 'pl-10' : '',
              hasRightSlot ? 'pr-10' : '',
              error ? 'border-down focus:border-down focus:ring-down/20' : '',
              className || '',
              inputClassName,
            ].join(' ')}
            {...inputProps}
          />
          {hasRightSlot ? (
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-4 text-textSecondary">
              {rightSlot}
            </div>
          ) : null}
        </div>
        {error ? (
          <div className="mt-1.5 text-[12px] text-down">{error}</div>
        ) : helper ? (
          <div className="mt-1.5 text-[12px] text-textMuted">{helper}</div>
        ) : null}
      </div>
    );
  }
);

FormField.displayName = 'FormField';

export default FormField;
