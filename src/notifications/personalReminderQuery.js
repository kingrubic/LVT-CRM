import React from 'react';
import { convexErrorText } from '../lib/appErrorMessage.js';

const AUTH_FAILURE_CODES = [
  'UNAUTHENTICATED',
  'ACCOUNT_LOCKED',
  'USER_NOT_ACTIVE',
  'PASSWORD_CHANGE_REQUIRED',
];

export function isPersonalReminderAuthFailure(error) {
  const raw = convexErrorText(error);
  return AUTH_FAILURE_CODES.some((code) => raw.includes(code));
}

/** Missing/broken reminder backend must not take down Công việc / Công tác. */
export function personalReminderQueryBoundaryState(error) {
  if (isPersonalReminderAuthFailure(error)) throw error;
  return { failed: true };
}

export class PersonalReminderQueryBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError(error) {
    return personalReminderQueryBoundaryState(error);
  }

  render() {
    if (this.state.failed) return this.props.fallback;
    return this.props.children;
  }
}
