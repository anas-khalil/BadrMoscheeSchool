import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { startDirectorySync } from './directorySync';
import './styles.css';
import './styles-mobile.css';

startDirectorySync();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
