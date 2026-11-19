import React from 'react';
import { recordCaughtError } from '@/lib/crash-guard';

interface AdErrorBoundaryProps {
  children: React.ReactNode;
  onError?: () => void;
}

interface AdErrorBoundaryState {
  hasError: boolean;
}

/**
 * Isolates ad modal rendering errors so an AdMob native view or asset failure
 * closes the ad gracefully instead of crashing the entire application.
 */
export class AdErrorBoundary extends React.Component<AdErrorBoundaryProps, AdErrorBoundaryState> {
  state: AdErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): AdErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    recordCaughtError('AdErrorBoundary', error, info.componentStack ?? undefined);
    this.props.onError?.();
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return null;
    }
    return this.props.children;
  }
}
