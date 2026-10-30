
import React from 'react';
import AppRoutes from './AppRoutes';
import { AppProvider } from '../context/AppContext';

const AppWrapper: React.FC = () => {
  return (
    <AppProvider>
      <AppRoutes />
    </AppProvider>
  );
};

export default AppWrapper;
