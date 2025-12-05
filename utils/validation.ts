/**
 * Input validation and sanitization utilities
 */

/**
 * Sanitize string input - removes HTML tags and trims whitespace
 */
export const sanitizeString = (input: string | undefined | null): string => {
  if (!input || typeof input !== 'string') return '';
  
  // Remove HTML tags
  const withoutHtml = input.replace(/<[^>]*>/g, '');
  
  // Trim whitespace
  return withoutHtml.trim();
};

/**
 * Validate and sanitize email address
 */
export const validateEmail = (email: string | undefined | null): { isValid: boolean; sanitized: string } => {
  if (!email || typeof email !== 'string') {
    return { isValid: false, sanitized: '' };
  }
  
  const sanitized = email.trim().toLowerCase();
  
  // RFC 5322 compliant email regex (simplified)
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  
  return {
    isValid: emailRegex.test(sanitized),
    sanitized: sanitized
  };
};

/**
 * Validate URL
 */
export const validateUrl = (url: string | undefined | null): boolean => {
  if (!url || typeof url !== 'string') return false;
  
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

/**
 * Sanitize object - removes undefined values and sanitizes strings
 */
export const sanitizeObject = <T extends Record<string, any>>(obj: T): Partial<T> => {
  const sanitized: Partial<T> = {};
  
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null) {
      continue; // Skip undefined/null values
    }
    
    if (typeof value === 'string') {
      sanitized[key as keyof T] = sanitizeString(value) as T[keyof T];
    } else if (typeof value === 'object' && !Array.isArray(value) && value !== null) {
      sanitized[key as keyof T] = sanitizeObject(value) as T[keyof T];
    } else {
      sanitized[key as keyof T] = value;
    }
  }
  
  return sanitized;
};

/**
 * Validate required fields
 */
export const validateRequired = (value: any, fieldName: string): string | null => {
  if (value === undefined || value === null || value === '') {
    return `${fieldName}は必須です。`;
  }
  
  if (typeof value === 'string' && value.trim() === '') {
    return `${fieldName}は必須です。`;
  }
  
  return null;
};

/**
 * Validate string length
 */
export const validateLength = (value: string, min: number, max: number, fieldName: string): string | null => {
  if (value.length < min) {
    return `${fieldName}は${min}文字以上である必要があります。`;
  }
  
  if (value.length > max) {
    return `${fieldName}は${max}文字以下である必要があります。`;
  }
  
  return null;
};

/**
 * Sanitize form data before submission
 */
export const sanitizeFormData = (formData: Record<string, any>): Record<string, any> => {
  const sanitized: Record<string, any> = {};
  
  for (const [key, value] of Object.entries(formData)) {
    if (value === undefined || value === null) {
      continue;
    }
    
    if (typeof value === 'string') {
      // Special handling for email
      if (key === 'email') {
        const emailValidation = validateEmail(value);
        sanitized[key] = emailValidation.sanitized;
      } else {
        sanitized[key] = sanitizeString(value);
      }
    } else if (typeof value === 'object' && !Array.isArray(value)) {
      sanitized[key] = sanitizeObject(value);
    } else {
      sanitized[key] = value;
    }
  }
  
  return sanitized;
};

