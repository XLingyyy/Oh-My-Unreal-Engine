import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { DesktopBootstrapError } from './components/DesktopBootstrapError';
import './theme/tokens.css';
import './styles.css';
import './components/workbench/workbench.css';
import './bootstrap.css';

const root = ReactDOM.createRoot(document.getElementById('root')!);
const content =
  typeof window.omue === 'undefined' ? <DesktopBootstrapError /> : <App />;

root.render(
  <React.StrictMode>
    {content}
  </React.StrictMode>,
);
