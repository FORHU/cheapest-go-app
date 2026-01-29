import { useState, useCallback } from 'react';

/**
 * Validation errors mapped to form field names
 */
export type FormErrors<T> = Partial<Record<keyof T, string>>;

/**
 * Touched state for form fields
 */
export type FormTouched<T> = Partial<Record<keyof T, boolean>>;

/**
 * Options for configuring form behavior
 */
export interface UseFormStateOptions<T> {
  /** Initial form values */
  initialValues: T;
  /** Validation function that returns errors object */
  validate?: (values: T) => FormErrors<T>;
  /** Submit handler called when form is submitted with valid data */
  onSubmit?: (values: T) => void | Promise<void>;
  /** Whether to validate on change (default: false) */
  validateOnChange?: boolean;
  /** Whether to validate on blur (default: true) */
  validateOnBlur?: boolean;
}

/**
 * Return type for useFormState hook
 */
export interface UseFormStateReturn<T> {
  /** Current form values */
  values: T;
  /** Validation errors for each field */
  errors: FormErrors<T>;
  /** Which fields have been touched/focused */
  touched: FormTouched<T>;
  /** Whether form is currently submitting */
  isSubmitting: boolean;
  /** Whether form has been modified */
  isDirty: boolean;
  /** Whether form has validation errors */
  isValid: boolean;
  /** Handle input change */
  handleChange: (name: keyof T, value: any) => void;
  /** Handle input blur */
  handleBlur: (name: keyof T) => void;
  /** Handle form submission */
  handleSubmit: (e: React.FormEvent) => void;
  /** Reset form to initial values */
  reset: () => void;
  /** Set a specific field value */
  setFieldValue: (name: keyof T, value: any) => void;
  /** Set a specific field error */
  setFieldError: (name: keyof T, error: string) => void;
  /** Set all form values at once */
  setValues: (values: T) => void;
}

/**
 * Form state management hook with validation
 * Consolidates form handling logic that's currently scattered across components
 *
 * @example
 * ```tsx
 * const { values, errors, touched, handleChange, handleBlur, handleSubmit } = useFormState({
 *   initialValues: { email: '', password: '' },
 *   validate: (values) => {
 *     const errors: FormErrors<typeof values> = {};
 *     if (!values.email) errors.email = 'Email is required';
 *     if (!values.password) errors.password = 'Password is required';
 *     return errors;
 *   },
 *   onSubmit: async (values) => {
 *     await login(values.email, values.password);
 *   },
 * });
 *
 * <form onSubmit={handleSubmit}>
 *   <input
 *     value={values.email}
 *     onChange={(e) => handleChange('email', e.target.value)}
 *     onBlur={() => handleBlur('email')}
 *   />
 *   {touched.email && errors.email && <span>{errors.email}</span>}
 * </form>
 * ```
 */
export function useFormState<T extends Record<string, any>>({
  initialValues,
  validate,
  onSubmit,
  validateOnChange = false,
  validateOnBlur = true,
}: UseFormStateOptions<T>): UseFormStateReturn<T> {
  const [values, setValuesState] = useState<T>(initialValues);
  const [errors, setErrors] = useState<FormErrors<T>>({});
  const [touched, setTouched] = useState<FormTouched<T>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isDirty = JSON.stringify(values) !== JSON.stringify(initialValues);
  const isValid = Object.keys(errors).length === 0;

  const runValidation = useCallback(
    (valuesToValidate: T): FormErrors<T> => {
      if (!validate) return {};
      return validate(valuesToValidate);
    },
    [validate]
  );

  const handleChange = useCallback(
    (name: keyof T, value: any) => {
      const newValues = { ...values, [name]: value };
      setValuesState(newValues);

      if (validateOnChange) {
        const validationErrors = runValidation(newValues);
        setErrors(validationErrors);
      }
    },
    [values, validateOnChange, runValidation]
  );

  const handleBlur = useCallback(
    (name: keyof T) => {
      setTouched((prev) => ({ ...prev, [name]: true }));

      if (validateOnBlur) {
        const validationErrors = runValidation(values);
        setErrors(validationErrors);
      }
    },
    [values, validateOnBlur, runValidation]
  );

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();

      // Mark all fields as touched
      const allTouched = Object.keys(values).reduce(
        (acc, key) => ({ ...acc, [key]: true }),
        {} as FormTouched<T>
      );
      setTouched(allTouched);

      // Validate all fields
      const validationErrors = runValidation(values);
      setErrors(validationErrors);

      // Only submit if no errors
      if (Object.keys(validationErrors).length === 0) {
        setIsSubmitting(true);
        Promise.resolve(onSubmit?.(values))
          .catch((error) => {
            console.error('Form submission error:', error);
          })
          .finally(() => {
            setIsSubmitting(false);
          });
      }
    },
    [values, runValidation, onSubmit]
  );

  const reset = useCallback(() => {
    setValuesState(initialValues);
    setErrors({});
    setTouched({});
    setIsSubmitting(false);
  }, [initialValues]);

  const setFieldValue = useCallback(
    (name: keyof T, value: any) => {
      handleChange(name, value);
    },
    [handleChange]
  );

  const setFieldError = useCallback((name: keyof T, error: string) => {
    setErrors((prev) => ({ ...prev, [name]: error }));
  }, []);

  const setValues = useCallback((newValues: T) => {
    setValuesState(newValues);
  }, []);

  return {
    values,
    errors,
    touched,
    isSubmitting,
    isDirty,
    isValid,
    handleChange,
    handleBlur,
    handleSubmit,
    reset,
    setFieldValue,
    setFieldError,
    setValues,
  };
}
