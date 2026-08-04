import { Component, type ErrorInfo, type ReactNode } from 'react';
import { logger } from '../lib/logger';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message?: string;
}

/**
 * Top-level error boundary so a render crash shows a recovery UI
 * instead of a blank white screen on Android / web.
 */
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error?.message || 'Unexpected error' };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    logger.error('AppErrorBoundary', 'Render crash', error, {
      component_stack: info.componentStack?.slice(0, 2000),
    });
  }

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
            fontFamily: 'system-ui, sans-serif',
            background: '#0f1f17',
            color: '#f4f7f5',
            textAlign: 'center',
          }}
        >
          <h1 style={{ fontSize: 22, marginBottom: 8 }}>Something went wrong</h1>
          <p style={{ opacity: 0.8, maxWidth: 360, marginBottom: 24 }}>
            Eravat hit an unexpected error. Your offline reports are still saved on this device.
            Reload to continue.
          </p>
          <button
            type="button"
            onClick={this.handleReload}
            style={{
              background: '#2d6a4f',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              padding: '12px 24px',
              fontSize: 16,
              cursor: 'pointer',
            }}
          >
            Reload app
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
