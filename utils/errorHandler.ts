/**
 * Standardized error handling utilities
 */

export interface AppError {
  code: string;
  message: string;
  details?: any;
}

/**
 * Standard error codes
 */
export enum ErrorCode {
  NETWORK_ERROR = 'NETWORK_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  AUTH_ERROR = 'AUTH_ERROR',
  PERMISSION_ERROR = 'PERMISSION_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  SERVER_ERROR = 'SERVER_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

/**
 * Create a standardized error object
 */
export const createError = (
  code: ErrorCode,
  message: string,
  details?: any
): AppError => {
  return { code, message, details };
};

/**
 * Handle and format errors from various sources
 */
export const handleError = (error: unknown): AppError => {
  // Firebase Auth errors
  if (error && typeof error === 'object' && 'code' in error) {
    const firebaseError = error as { code: string; message?: string };
    
    if (firebaseError.code.startsWith('auth/')) {
      return createError(
        ErrorCode.AUTH_ERROR,
        getAuthErrorMessage(firebaseError.code),
        firebaseError
      );
    }
    
    if (firebaseError.code.startsWith('permission-denied')) {
      return createError(
        ErrorCode.PERMISSION_ERROR,
        'アクセス権限がありません。',
        firebaseError
      );
    }
    
    if (firebaseError.code.startsWith('not-found')) {
      return createError(
        ErrorCode.NOT_FOUND,
        'リソースが見つかりませんでした。',
        firebaseError
      );
    }
  }
  
  // Network errors
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return createError(
      ErrorCode.NETWORK_ERROR,
      'ネットワークエラーが発生しました。インターネット接続を確認してください。',
      error
    );
  }
  
  // Standard Error objects
  if (error instanceof Error) {
    return createError(
      ErrorCode.UNKNOWN_ERROR,
      error.message || '予期しないエラーが発生しました。',
      error
    );
  }
  
  // String errors
  if (typeof error === 'string') {
    return createError(ErrorCode.UNKNOWN_ERROR, error);
  }
  
  // Unknown error type
  return createError(
    ErrorCode.UNKNOWN_ERROR,
    '予期しないエラーが発生しました。',
    error
  );
};

/**
 * Get user-friendly error message for Firebase Auth errors
 */
const getAuthErrorMessage = (code: string): string => {
  const errorMessages: Record<string, string> = {
    'auth/invalid-credential': 'メールアドレスまたはパスワードが無効です。',
    'auth/wrong-password': 'パスワードが間違っています。',
    'auth/user-not-found': 'ユーザーが見つかりません。',
    'auth/email-already-in-use': 'このメールアドレスは既に使用されています。',
    'auth/weak-password': 'パスワードが弱すぎます。',
    'auth/network-request-failed': 'ネットワークエラーが発生しました。',
    'auth/too-many-requests': 'リクエストが多すぎます。しばらく待ってから再試行してください。',
    'auth/user-disabled': 'このアカウントは無効化されています。',
  };
  
  return errorMessages[code] || '認証エラーが発生しました。';
};

/**
 * Log error to console (and optionally to error tracking service)
 */
export const logError = (error: AppError, context?: string): void => {
  const errorMessage = context 
    ? `[${context}] ${error.message}`
    : error.message;
  
  console.error(errorMessage, {
    code: error.code,
    details: error.details,
  });
  
  // TODO: Add error tracking service integration (e.g., Sentry, LogRocket)
  // if (process.env.NODE_ENV === 'production') {
  //   errorTrackingService.captureException(error);
  // }
};

/**
 * Show error to user (standardized UI feedback)
 */
export const showError = (error: AppError, showAlert = false): void => {
  logError(error);
  
  if (showAlert) {
    // Use a toast notification system if available, otherwise fallback to alert
    // For now, using alert as fallback
    alert(error.message);
  }
};

/**
 * Handle async errors with proper error formatting
 */
export const handleAsyncError = async <T>(
  asyncFn: () => Promise<T>,
  context?: string
): Promise<[T | null, AppError | null]> => {
  try {
    const result = await asyncFn();
    return [result, null];
  } catch (error) {
    const appError = handleError(error);
    logError(appError, context);
    return [null, appError];
  }
};

