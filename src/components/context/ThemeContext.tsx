"use client";

import React, { createContext, useContext, useEffect, useState } from 'react';
import { Theme, ThemeContextType, BaseProps } from '../../types';
import { Toaster } from 'sonner';

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<BaseProps> = ({ children }) => {
  const [theme, setTheme] = useState<Theme>('light');

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
      <Toaster
        theme={theme}
        closeButton
        position="top-right"
        toastOptions={{
          style: {
            background: 'rgb(37 99 235)',
            color: 'white',
            border: 'none',
            borderRadius: '1rem',
          },
          className: "font-sans font-medium",
        }}
      />
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};