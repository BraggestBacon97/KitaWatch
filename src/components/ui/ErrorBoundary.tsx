import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { RotateCcw } from 'lucide-react';
import Button from './Button';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/** Last line of defense: a single bad render must never white-screen the app. */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[kitawatch] render error:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-10 text-center">
          <p className="font-semibold text-zinc-200">KitaWatch hit an unexpected error</p>
          <p className="max-w-md font-mono text-xs text-zinc-500">
            {this.state.error.message}
          </p>
          <Button variant="outline" size="sm" onClick={() => location.reload()}>
            <RotateCcw className="h-3.5 w-3.5" /> Reload app
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
