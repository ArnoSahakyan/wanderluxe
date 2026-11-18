import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ErrorScreen } from './ErrorScreen';

/**
 * Last line of defence for errors outside the router (providers, toasts…).
 * Errors inside pages are handled by RouteErrorPage.
 */
export class AppErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled application error', error, info.componentStack);
  }

  render() {
    return this.state.failed ? (
      <ErrorScreen
        title='Something went wrong'
        description='WanderLuxe ran into an unexpected problem. Please reload the page.'
      />
    ) : (
      this.props.children
    );
  }
}
