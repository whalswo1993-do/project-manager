import { Component } from 'react';

export class ErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }
    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }
    render() {
        if (this.state.hasError) {
            try {
                return (
                    <div style={{padding: "20px", color: "red", background: "#fee", zIndex: 9999, position: 'relative'}}>
                        <h2>Runtime Error</h2>
                        <pre>{this.state.error ? (this.state.error.stack || this.state.error.message || String(this.state.error)) : "Unknown Error"}</pre>
                    </div>
                );
            } catch {
                return <div style={{padding: "20px", color: "red", background: "#fee"}}>FATAL ERROR IN ERROR BOUNDARY</div>;
            }
        }
        return this.props.children;
    }
}
