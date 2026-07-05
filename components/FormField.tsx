import React from 'react';
import AppInput from './AppInput';

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
          <AppInput
            ref={ref}
            className={[
              hasLeftSlot ? '!pl-10' : '',
              hasRightSlot ? '!pr-10' : '',
              className || '',
              inputClassName,
            ].filter(Boolean).join(' ')}
            size={size}
            borderless={borderless}
            invalid={Boolean(error)}
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
