import { Component } from 'react';

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Could send to an error reporting service
    console.error('ErrorBoundary caught:', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', minHeight: '100vh', backgroundColor: '#1a1a1a',
          color: 'white', fontFamily: '"Poppins", sans-serif', padding: '40px',
          textAlign: 'center', gap: '16px',
        }}>
          <h2 style={{ fontSize: '24px', color: '#ff6b6b' }}>Something went wrong</h2>
          <p style={{ fontSize: '14px', opacity: 0.7, maxWidth: '400px' }}>
            {this.state.error.message || 'An unexpected error occurred.'}
          </p>
          <button
            onClick={() => {
              this.setState({ error: null });
              window.location.reload();
            }}
            style={{
              marginTop: '12px', padding: '12px 28px', fontSize: '15px',
              fontWeight: 600, color: '#fff', backgroundColor: '#007bff',
              border: 'none', borderRadius: '8px', cursor: 'pointer',
            }}
          >
            Reload App
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
