import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('ErrorBoundary caught:', error, info);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-8">
          <div className="card max-w-lg w-full">
            <div className="font-body text-xs tracking-[0.2em] text-signal mb-2">// FAULT</div>
            <h1 className="font-display text-4xl mb-3">Something broke.</h1>
            <p className="text-bone-200/80 mb-6">
              {this.state.error?.message || 'An unexpected error occurred.'}
            </p>
            <button onClick={this.handleReset} className="btn-primary">
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
