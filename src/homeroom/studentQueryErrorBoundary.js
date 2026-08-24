import React from 'react';
import { convexErrorText, messageFor } from '../lib/appErrorMessage.js';
import { BACK_TO_OVERVIEW } from './classCatalog.js';

export const STUDENT_QUERY_ERROR_TITLE = 'Không thể tải chi tiết học sinh.';

const AUTH_FAILURE_CODES = [
  'UNAUTHENTICATED',
  'ACCOUNT_LOCKED',
  'USER_NOT_ACTIVE',
  'PASSWORD_CHANGE_REQUIRED',
];

export function isHomeroomAuthFailure(error) {
  const raw = convexErrorText(error);
  return AUTH_FAILURE_CODES.some((code) => raw.includes(code));
}

export function studentQueryErrorBoundaryState(error) {
  if (isHomeroomAuthFailure(error)) throw error;
  return { error };
}

export function HomeroomStudentQueryErrorFallback({ error, onBack }) {
  return React.createElement(
    'div',
    { className: 'homeroom-panel', role: 'alert' },
    React.createElement('h2', null, STUDENT_QUERY_ERROR_TITLE),
    React.createElement('p', { className: 'homeroom-issue' }, messageFor(error)),
    React.createElement('button', { type: 'button', onClick: onBack }, BACK_TO_OVERVIEW),
  );
}

export class HomeroomStudentQueryErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return studentQueryErrorBoundaryState(error);
  }

  render() {
    if (this.state.error) {
      return React.createElement(HomeroomStudentQueryErrorFallback, {
        error: this.state.error,
        onBack: this.props.onBack,
      });
    }
    return this.props.children;
  }
}
