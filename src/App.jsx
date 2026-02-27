import InstagramStoryBuilder from './InstagramStoryBuilder';
import { ErrorBoundary } from './components/ErrorBoundary';

function App() {
  return (
    <ErrorBoundary>
      <InstagramStoryBuilder />
    </ErrorBoundary>
  );
}

export default App;
